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
import { buildSignatureCertificate } from "../_shared/signatureCertificatePdf.ts";
import { createCalendarEvent, getFreshAccessToken } from "../_shared/google-calendar.ts";

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
  // Mandatory identity fields captured in the signature section of the form.
  first_name: z.string().trim().min(1, "שם פרטי חסר").max(80),
  last_name: z.string().trim().min(1, "שם משפחה חסר").max(80),
  identity_number: z.string().trim().regex(/^\d{5,20}$/, "תעודת זהות לא תקינה"),
});


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
        .select("id, title, status, pdf_path, signed_pdf_path, signer_name, expires_at, signed_at, viewed_at, fields")
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
          property_address: (doc.fields as any)?.property_address ?? null,
          tour_date: (doc.fields as any)?.tour_date ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "POST") {
      const parsed = SignSchema.safeParse(await req.json());
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { token: tk, signature_data, first_name, last_name } = parsed.data;
      const identityNumber = parsed.data.identity_number.replace(/\D/g, "");
      // The signed name is always built from the two mandatory name fields.
      const signer_name = `${first_name} ${last_name}`.replace(/\s+/g, " ").trim();


      const { data: doc, error } = await admin
        .from("closing_documents")
        .select("id, user_id, lead_id, listing_id, template_key, title, pdf_path, sign_token, status, expires_at, fields, workspace_owner_id")
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
          fields: {
            ...((doc.fields ?? {}) as Record<string, unknown>),
            signer_first_name: first_name,
            signer_last_name: last_name,
            signer_identity_number: identityNumber,
          },
        })
        .eq("id", doc.id);

      // Move lead to "negotiation" or keep as "awaiting_signature"? Mark as closed candidate via stage flip:
      await admin
        .from("leads")
        .update({ lead_stage: "negotiation", last_interaction_at: nowIso, identity_number: identityNumber })
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

      // ── Signed tour agreements become a real tour, a calendar event and an
      // instant WhatsApp confirmation from Rita. Every step is best-effort:
      // a failure here must never break the client's signing experience.
      try {
        const fields = (doc.fields ?? {}) as Record<string, any>;
        const rawTour = fields.tour_date ? String(fields.tour_date) : "";
        const tourStart = rawTour ? new Date(rawTour) : null;
        const tourValid = tourStart && !Number.isNaN(tourStart.getTime());

        const { data: leadRow } = await admin
          .from("leads")
          .select("id, full_name, phone_number, email, workspace_owner_id")
          .eq("id", doc.lead_id)
          .maybeSingle();

        const ownerId = String(
          (doc as any).workspace_owner_id ??
            (leadRow as any)?.workspace_owner_id ??
            doc.user_id,
        );
        const clientName = signer_name || (leadRow as any)?.full_name || "לקוח";
        const address = String(fields.property_address ?? "") || null;

        if (tourValid && doc.template_key === "tour_agreement") {
          // Link the signature to a property tour (update the matching pending
          // tour when one already exists, otherwise create it).
          const startIso = tourStart!.toISOString();
          const { data: existing } = await admin
            .from("property_tours")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("scheduled_at", startIso)
            .eq("client_phone", String((leadRow as any)?.phone_number ?? ""))
            .maybeSingle();

          const tourPayload = {
            owner_id: ownerId,
            listing_id: (doc as any).listing_id ?? null,
            client_name: clientName,
            client_phone: String((leadRow as any)?.phone_number ?? "") || "—",
            client_email: (leadRow as any)?.email ?? null,
            scheduled_at: startIso,
            timezone: "Asia/Jerusalem",
            property_address: address,
            // Signing the form is NOT the client approving the time — the tour
            // stays pending until the client approves it (tour-confirm), and
            // only then is the calendar event created.
            status: "pending",
            notes: `נחתם הסכם סיור בנכס: ${doc.title}`,
            metadata: {
              lead_id: doc.lead_id,
              document_id: doc.id,
              signed_at: nowIso,
              signer_name: clientName,
            },
          };
          const tourId = (existing as any)?.id;
          if (tourId) {
            const { status: _ignored, ...keepStatus } = tourPayload;
            await admin.from("property_tours").update(keepStatus).eq("id", tourId);
          } else {
            await admin.from("property_tours").insert(tourPayload);
          }
        }

        // Instant WhatsApp alert to the broker: the client signed the form.
        try {
          const { data: brokerProfile } = await admin
            .from("profiles")
            .select("phone")
            .eq("id", ownerId)
            .maybeSingle();
          const brokerPhone = (brokerProfile as { phone?: string } | null)?.phone;
          if (brokerPhone) {
            await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_ROLE}`,
                apikey: SERVICE_ROLE,
              },
              body: JSON.stringify({
                phone_number: brokerPhone,
                message: [
                  `✍️ איש הקשר חתם על ${doc.title}`,
                  `👤 איש קשר: ${clientName}`,
                  ...((leadRow as any)?.phone_number ? [`📞 טלפון: ${(leadRow as any).phone_number}`] : []),
                  ...(address ? [`🏠 נכס: ${address}`] : []),
                ].join("\n"),
                tenant_id: ownerId,
              }),
            });
          }
        } catch (e) {
          console.error("sign-closing-doc broker alert failed", e);
        }

        // Immediate WhatsApp confirmation in Rita's voice.
        if ((leadRow as any)?.phone_number) {
          const when = tourValid
            ? new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jerusalem",
            }).format(tourStart!)
            : null;
          const lines = [
            `תודה ${clientName}, קיבלתי את החתימה שלך על ${doc.title}.`,
            address && when
              ? `נתראה ב${address} ב-${when}.`
              : address
                ? `נתראה ב${address}.`
                : null,
            "אני כאן לכל שאלה עד אז.",
          ].filter(Boolean);
          await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
            },
            body: JSON.stringify({
              lead_id: doc.lead_id,
              message: lines.join("\n"),
              tenant_id: ownerId,
            }),
          }).catch(() => {});
        }
      } catch (e) {
        console.error("sign-closing-doc post-signature automation failed", e);
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
