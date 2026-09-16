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

    // ---- Workspace identity: the verified WhatsApp number of THIS workspace ----
    // The document owner may be a team member, so resolve the workspace owner and
    // pass it as `tenant_id`, forcing send-whatsapp to route through the
    // workspace's own verified WABA credentials instead of a default sender.
    const { data: ownerProf } = await admin
      .from("profiles")
      .select("id, full_name, active_workspace_owner_id, workspace_owner_id")
      .eq("id", doc.user_id)
      .maybeSingle();
    const workspaceOwnerId = String(
      (ownerProf as any)?.active_workspace_owner_id ??
        (ownerProf as any)?.workspace_owner_id ??
        doc.user_id,
    );

    let brokerName = String((ownerProf as any)?.full_name ?? "").trim();
    if (workspaceOwnerId !== doc.user_id) {
      const { data: wsProf } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", workspaceOwnerId)
        .maybeSingle();
      brokerName = String((wsProf as any)?.full_name ?? brokerName ?? "").trim();
    }
    if (!brokerName) brokerName = "המשרד";

    // Confirm the workspace actually has a verified WhatsApp integration before
    // dispatching, so we never silently fall back to another sender identity.
    const { data: waSettings } = await admin
      .from("workspace_whatsapp_settings")
      .select("workspace_owner_id")
      .eq("workspace_owner_id", workspaceOwnerId)
      .maybeSingle();
    const { data: waProviderRows } = await admin
      .from("wa_providers")
      .select("config, is_active")
      .eq("provider_name", "WBA")
      .eq("is_active", true)
      .or(`tenant_id.eq.${workspaceOwnerId},user_id.eq.${workspaceOwnerId}`);
    const hasWorkspaceWaba = (waProviderRows ?? []).some(
      (r: any) => r?.config?.phone_number_id && r?.config?.access_token,
    );
    console.log("[send-closing-doc] wa routing", {
      workspace_owner_id: workspaceOwnerId,
      has_settings: !!(waSettings as any)?.workspace_owner_id,
      has_workspace_waba: hasWorkspaceWaba,
    });

    const origin = site_url ?? req.headers.get("origin") ?? "https://realtyz.co.il";
    const signUrl = `${origin.replace(/\/$/, "")}/sign/${doc.sign_token}`;
    const signerName = (doc.signer_name || "").trim();
    // Rita's persona always opens the message, on behalf of the active broker.
    const personaLine = `ריטה, הסוכנת הדיגיטלית של ${brokerName}`;
    const defaultBody = [
      personaLine,
      "",
      `${signerName ? `שלום ${signerName},` : "שלום,"} מצורף המסמך לחתימה דיגיטלית:`,
      `📄 ${doc.title}`,
      "",
      "לחתימה מאובטחת בקישור הבא:",
      signUrl,
    ].join("\n");
    const body = message?.trim()
      ? (message.startsWith(personaLine) ? message.trim() : `${personaLine}\n\n${message.trim()}`) +
        (message.includes(signUrl) ? "" : `\n\n${signUrl}`)
      : defaultBody;

    const fileName = `${doc.title.replace(/[^\w\-. ]+/g, "_")}.pdf`;
    // The PDF is a nice-to-have: if storage download fails we still deliver the
    // secure signing link, so the signature flow never dead-ends.
    let pdfBase64: string | null = null;
    try {
      pdfBase64 = await pdfToBase64(admin, doc.pdf_path!);
    } catch (e) {
      console.error("send-closing-doc pdf download failed", e);
    }

    const dispatch = async (withFile: boolean) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({
          lead_id: doc.lead_id,
          // Route strictly through this workspace's verified WABA number.
          tenant_id: workspaceOwnerId,
          message: body,
          ai_assisted: false,
          ...(withFile && pdfBase64
            ? {
              file: {
                base64: pdfBase64,
                file_name: fileName,
                mime_type: "application/pdf",
                caption: doc.title,
              },
            }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      return { ok: res.ok && json?.success !== false, status: res.status, json };
    };

    let sent = await dispatch(!!pdfBase64);
    if (!sent.ok && pdfBase64) {
      console.error("send-closing-doc file send failed, retrying text only", sent.json);
      sent = await dispatch(false);
    }
    if (!sent.ok) {
      throw new Error(
        sent.json?.details || sent.json?.error || `WhatsApp send failed (${sent.status})`,
      );
    }

    // ---- Admin / managing broker notification (best effort) ----
    // The client's delivery already succeeded above; a failure to alert the
    // manager must never fail the request.
    try {
      const { data: managerProfile } = await admin
        .from("profiles")
        .select("phone, full_name")
        .eq("id", workspaceOwnerId)
        .maybeSingle();
      const managerPhone = String((managerProfile as any)?.phone ?? "").trim();
      const { data: leadRow } = await admin
        .from("leads")
        .select("full_name, phone_number")
        .eq("id", doc.lead_id)
        .maybeSingle();
      if (managerPhone) {
        const alert = [
          `📤 נשלח מסמך לחתימה דיגיטלית`,
          `📄 ${doc.title}`,
          `👤 איש קשר: ${(leadRow as any)?.full_name || signerName || "—"}`,
          ...((leadRow as any)?.phone_number ? [`📞 ${(leadRow as any).phone_number}`] : []),
          `🔗 ${signUrl}`,
        ].join("\n");
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({
            phone_number: managerPhone,
            message: alert,
            tenant_id: workspaceOwnerId,
            ai_assisted: false,
          }),
        });
        if (!res.ok) {
          console.error("[send-closing-doc] manager alert failed", res.status, await res.text());
        }
      } else {
        console.warn("[send-closing-doc] no manager phone on file", { workspaceOwnerId });
      }
    } catch (e) {
      console.error("[send-closing-doc] manager alert error", e);
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

    // CRM timeline entry so the broker sees the signature request in the
    // contact's history, with its live status badge.
    await admin.from("interaction_activity_log").insert({
      user_id: workspaceOwnerId,
      thread_key: `lead:${doc.lead_id}`,
      platform: "whatsapp",
      action_type: "signature_request",
      actor_type: "ai",
      actor_id: userId,
      actor_label: "ריטה",
      content: `נשלח מסמך לחתימה דיגיטלית: ${doc.title}`,
      metadata: {
        lead_id: doc.lead_id,
        document_id: document_id,
        document_title: doc.title,
        signature_status: "pending",
        sign_url: signUrl,
      },
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
