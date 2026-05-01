/**
 * send-closing-doc
 * ----------------
 * Sends an existing draft closing document to the lead via WhatsApp:
 *  - Generates a public sign URL using SITE_URL (or origin header fallback)
 *  - Sends a short WhatsApp message + the PDF as attachment
 *  - Marks document status='sent', sets sent_at
 *  - Updates leads.lead_stage = 'awaiting_signature'
 *
 * Body: { document_id: uuid, message?: string, site_url?: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  document_id: z.string().uuid(),
  message: z.string().max(2000).optional(),
  site_url: z.string().url().optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function pdfToBase64(admin: any, path: string): Promise<string> {
  const { data, error } = await admin.storage.from("closing-docs").download(path);
  if (error || !data) throw new Error("PDF not found in storage");
  const buf = new Uint8Array(await data.arrayBuffer());
  // Chunked base64 to avoid call-stack overflow
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userRes.user.id;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { document_id, message, site_url } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: doc, error: docErr } = await admin
      .from("closing_documents")
      .select("id, user_id, lead_id, title, pdf_path, sign_token, signer_name, status")
      .eq("id", document_id)
      .maybeSingle();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (doc.user_id !== userId) {
      // allow team members
      const { data: tm } = await admin.rpc("is_team_member", { _user_id: userId });
      if (!tm) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (doc.status === "signed") {
      return new Response(JSON.stringify({ error: "Document already signed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const origin = site_url ?? req.headers.get("origin") ?? "https://app.realtyz.ai";
    const signUrl = `${origin.replace(/\/$/, "")}/sign/${doc.sign_token}`;
    const body = (message?.trim() ||
      `Hi ${doc.signer_name || "there"}, please review and sign your ${doc.title}. Secure link: ${signUrl}`) +
      (message?.includes(signUrl) ? "" : `\n\n${signUrl}`);

    const pdfBase64 = await pdfToBase64(admin, doc.pdf_path!);
    const fileName = `${doc.title.replace(/[^\w\-. ]+/g, "_")}.pdf`;

    // Send via existing unified gateway
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({
        lead_id: doc.lead_id,
        message: body,
        ai_assisted: false,
        file: {
          base64: pdfBase64,
          file_name: fileName,
          mime_type: "application/pdf",
          caption: doc.title,
        },
      }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok || !sendJson?.success) {
      throw new Error(sendJson?.error || `WhatsApp send failed (${sendRes.status})`);
    }

    // Update document + lead stage
    await admin
      .from("closing_documents")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", document_id);

    await admin
      .from("leads")
      .update({ lead_stage: "awaiting_signature", last_interaction_at: new Date().toISOString() })
      .eq("id", doc.lead_id);

    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "closing_document.sent",
      target_table: "closing_documents",
      target_id: document_id,
      details: { lead_id: doc.lead_id, sign_url: signUrl },
    });

    return new Response(JSON.stringify({ success: true, sign_url: signUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    console.error("send-closing-doc error", e);
    return new Response(JSON.stringify({ error: e?.message || "Send failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
