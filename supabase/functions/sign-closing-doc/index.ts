/**
 * sign-closing-doc
 * ----------------
 * Public endpoint (no auth) used by the lead-facing /sign/:token page.
 *
 * GET  ?token=...               → returns document metadata + a short-lived
 *                                  signed URL to view the original PDF, and
 *                                  marks the doc viewed if not yet viewed.
 * POST { token, signature_data, signer_name? }
 *                                → embeds the drawn signature onto a new
 *                                  page appended to the original PDF, stores
 *                                  it under signed_pdf_path, sets the doc to
 *                                  status='signed', records signer_name,
 *                                  signed_at, and updates the lead stage.
 *
 * Identity is bound to the secret token; we never expose lead_id to the
 * lead's client.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SignSchema = z.object({
  token: z.string().min(20).max(100),
  signature_data: z.string().startsWith("data:image/").max(500_000),
  signer_name: z.string().min(1).max(160).optional(),
});

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const tk = url.searchParams.get("token") || "";
      if (!tk) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: doc, error } = await admin
        .from("closing_documents")
        .select("id, title, status, pdf_path, signed_pdf_path, signer_name, expires_at, signed_at, viewed_at")
        .eq("sign_token", tk)
        .maybeSingle();
      if (error || !doc) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (new Date(doc.expires_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: "Document expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const targetPath = doc.signed_pdf_path || doc.pdf_path;
      const { data: signed } = await admin.storage.from("closing-docs").createSignedUrl(targetPath!, 60 * 30);

      if (doc.status === "sent" && !doc.viewed_at) {
        await admin.from("closing_documents").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", doc.id);
      }

      return new Response(
        JSON.stringify({
          id: doc.id,
          title: doc.title,
          status: doc.status,
          signer_name: doc.signer_name,
          signed_at: doc.signed_at,
          pdf_url: signed?.signedUrl ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "POST") {
      const parsed = SignSchema.safeParse(await req.json());
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { token: tk, signature_data, signer_name } = parsed.data;

      const { data: doc, error } = await admin
        .from("closing_documents")
        .select("id, user_id, lead_id, title, pdf_path, sign_token, status, expires_at")
        .eq("sign_token", tk)
        .maybeSingle();
      if (error || !doc) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (doc.status === "signed") {
        return new Response(JSON.stringify({ error: "Already signed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (new Date(doc.expires_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: "Document expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Download original
      const { data: blob, error: dlErr } = await admin.storage.from("closing-docs").download(doc.pdf_path!);
      if (dlErr || !blob) throw new Error("Could not load source PDF");
      const srcBytes = new Uint8Array(await blob.arrayBuffer());

      // Hebrew signature certificate, appended as an extra page so the original
      // form stays byte-identical. pdf-lib's standard fonts cannot encode
      // Hebrew, so the page is drawn with jsPDF + the embedded Unicode font and
      // then merged in.
      const certBytes = await buildSignatureCertificate({
        title: doc.title || "מסמך",
        signerName: signer_name || "הלקוח",
        signedAt: new Date(),
        token: tk,
        signatureDataUrl: signature_data,
      });

      const pdfDoc = await PDFDocument.load(srcBytes);
      const certDoc = await PDFDocument.load(certBytes);
      const copied = await pdfDoc.copyPages(certDoc, certDoc.getPageIndices());
      copied.forEach((p) => pdfDoc.addPage(p));

      const out = await pdfDoc.save();
      const signedPath = doc.pdf_path!.replace(/\.pdf$/, ".signed.pdf");
      const { error: upErr } = await admin.storage.from("closing-docs").upload(signedPath, out, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) throw upErr;

      const nowIso = new Date().toISOString();
      await admin
        .from("closing_documents")
        .update({
          status: "signed",
          signed_at: nowIso,
          signed_pdf_path: signedPath,
          signer_name: signer_name || null,
          signature_data: signature_data.slice(0, 100), // store a tiny prefix only (full image is in the PDF)
        })
        .eq("id", doc.id);

      // Move lead to "negotiation" or keep as "awaiting_signature"? Mark as closed candidate via stage flip:
      await admin
        .from("leads")
        .update({ lead_stage: "negotiation", last_interaction_at: nowIso })
        .eq("id", doc.lead_id);

      await admin.from("audit_logs").insert({
        actor_id: doc.user_id,
        action: "closing_document.signed",
        target_table: "closing_documents",
        target_id: doc.id,
        details: { lead_id: doc.lead_id, signer_name: signer_name || null },
      });

      // CRM timeline: mark the existing signature-request entries as signed and
      // add a dedicated "signed" event.
      try {
        const { data: pendingRows } = await admin
          .from("interaction_activity_log")
          .select("id, metadata")
          .eq("thread_key", `lead:${doc.lead_id}`)
          .eq("action_type", "signature_request");
        for (const row of (pendingRows ?? []) as any[]) {
          if (String(row?.metadata?.document_id ?? "") !== doc.id) continue;
          await admin
            .from("interaction_activity_log")
            .update({ metadata: { ...(row.metadata ?? {}), signature_status: "signed", signed_at: nowIso } })
            .eq("id", row.id);
        }
        const { data: ownerProf } = await admin
          .from("profiles")
          .select("active_workspace_owner_id, workspace_owner_id")
          .eq("id", doc.user_id)
          .maybeSingle();
        const wsOwner = String(
          (ownerProf as any)?.active_workspace_owner_id ??
            (ownerProf as any)?.workspace_owner_id ?? doc.user_id,
        );
        await admin.from("interaction_activity_log").insert({
          user_id: wsOwner,
          thread_key: `lead:${doc.lead_id}`,
          platform: "internal",
          action_type: "signature_signed",
          actor_type: "system",
          actor_label: signer_name || "הלקוח",
          content: `המסמך נחתם דיגיטלית: ${doc.title}`,
          metadata: {
            lead_id: doc.lead_id,
            document_id: doc.id,
            document_title: doc.title,
            signature_status: "signed",
            signed_at: nowIso,
          },
        });
      } catch (e) {
        console.error("sign-closing-doc timeline log failed", e);
      }


      // Notify the agent
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({
            event_type: "document_signed",
            lead_id: doc.lead_id,
            override_user_id: doc.user_id,
            detail: `${signer_name || "Lead"} signed ${doc.title}`,
          }),
        });
      } catch (_) { /* notification failures are non-fatal */ }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sign-closing-doc error", e);
    return new Response(JSON.stringify({ error: e?.message || "Signing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
