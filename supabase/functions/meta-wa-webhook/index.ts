/**
 * meta-wa-webhook
 * ───────────────
 * Meta Cloud API webhook receiver dedicated to ACCOUNT / PHONE-NUMBER status
 * events (the inbound-message pipeline stays on `whatsapp-webhook`).
 *
 *   GET  → hub.challenge verification (token = MESSENGER_VERIFY_TOKEN)
 *   POST → handles field events:
 *            account_update, phone_number_name_update,
 *            phone_number_quality_update, account_review_update,
 *            business_capability_update
 *
 * Every event patches the matching `wa_providers` (WBA) row so the UI reflects
 * authorization immediately, and roadblocks are written to integration_error_logs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Cfg = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // ── Meta subscription handshake ───────────────────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected =
      Deno.env.get("WA_VERIFY_TOKEN") ??
      Deno.env.get("VERIFY_TOKEN") ??
      Deno.env.get("META_WA_VERIFY_TOKEN") ??
      Deno.env.get("MESSENGER_VERIFY_TOKEN") ??
      "";
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }


  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json({ received: true });
  }

  try {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const wabaId = String(entry?.id ?? "");
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const field = String(change?.field ?? "");
        const value = change?.value ?? {};

        // ── Inbound messages (field = "messages") ────────────────────────────
        if (field === "messages") {
          const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
          const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
          const msgs = Array.isArray(value?.messages) ? value.messages : [];

          // ── Delivery statuses ──────────────────────────────────────────────
          // A template/free-text send can return a wamid and still never reach
          // the recipient (undelivered, blocked, out of the 24h window, param
          // mismatch). Meta reports that only here, so record it on the message
          // row and surface real failures in the integration error log.
          const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
          for (const st of statuses) {
            const wamid = String(st?.id ?? "");
            const status = String(st?.status ?? "");
            if (!wamid || !status) continue;
            try {
              const { data: rows } = await admin
                .from("messages")
                .select("id, metadata")
                .eq("metadata->>message_id", wamid)
                .limit(1);
              const row = (rows ?? [])[0] as { id: string; metadata: Record<string, unknown> } | undefined;
              if (row) {
                await admin
                  .from("messages")
                  .update({
                    metadata: {
                      ...(row.metadata ?? {}),
                      status,
                      status_at: new Date().toISOString(),
                      status_errors: st?.errors ?? null,
                    },
                  })
                  .eq("id", row.id);
              }
              if (status === "failed") {
                const err = Array.isArray(st?.errors) ? st.errors[0] : null;
                await logIntegrationError({
                  integration: "whatsapp",
                  functionName: "meta-wa-webhook",
                  errorMessage: `WhatsApp delivery failed (${err?.code ?? "?"}): ${
                    err?.title ?? err?.message ?? "unknown"
                  }`,
                  context: { wamid, recipient_last4: String(st?.recipient_id ?? "").slice(-4), errors: st?.errors ?? null },
                });
              }
            } catch (stErr) {
              console.error("[meta-wa-webhook] status handling error", stErr);
            }
          }

          if (!msgs.length) continue;


          // Resolve workspace owner from the receiving phone number id / WABA id.
          // Inbound messages MUST end up on a lead with `assigned_to` set —
          // RLS hides leads (and therefore their messages) whose owner is NULL,
          // which is exactly how replies "arrive but never show in the UI".
          let ownerId: string | null = null;
          const { data: provRows } = await admin
            .from("wa_providers")
            .select("user_id, config")
            .eq("provider_name", "WBA");
          const provs = (provRows ?? []) as Array<{ user_id: string; config: Cfg }>;
          const prov = provs.find((row) => {
            const cfg = (row.config ?? {}) as Cfg;
            return (
              (phoneNumberId && String(cfg.phone_number_id ?? "") === phoneNumberId) ||
              (wabaId && String(cfg.waba_id ?? "") === wabaId)
            );
          });
          ownerId = prov?.user_id ?? null;

          // Fallback: the central platform number serves every workspace, so an
          // unmatched phone_number_id must not orphan the lead. Use the single
          // configured WBA workspace when there is exactly one.
          if (!ownerId && provs.length === 1) ownerId = provs[0].user_id ?? null;
          if (!ownerId) {
            const { data: adminRoles } = await admin
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin")
              .limit(1);
            ownerId = (adminRoles ?? [])[0]?.user_id ?? null;
          }
          if (!ownerId) {
            console.warn(
              "[meta-wa-webhook] no workspace owner resolved for inbound message",
              { phoneNumberId, wabaId },
            );
          }


          for (const m of msgs) {
            try {
              const from = String(m?.from ?? "").replace(/\D/g, "");
              if (!from) continue;
              const contact = contacts.find(
                (c: any) => String(c?.wa_id ?? "").replace(/\D/g, "") === from,
              );
              const profileName = contact?.profile?.name ?? null;

              const type = String(m?.type ?? "text");
              const content =
                m?.text?.body ??
                m?.button?.text ??
                m?.interactive?.button_reply?.title ??
                m?.interactive?.list_reply?.title ??
                m?.image?.caption ??
                m?.video?.caption ??
                m?.document?.filename ??
                (type === "image"
                  ? "[תמונה]"
                  : type === "audio"
                  ? "[הודעה קולית]"
                  : type === "video"
                  ? "[וידאו]"
                  : type === "document"
                  ? "[מסמך]"
                  : type === "location"
                  ? "[מיקום]"
                  : "[הודעת WhatsApp]");

              // 1. Ensure a CRM lead exists for this sender.
              const { data: leadId, error: leadErr } = await admin.rpc(
                "upsert_lead_from_interaction",
                {
                  _platform: "whatsapp",
                  _handle: from,
                  _external_id: from,
                  _full_name: profileName,
                  _phone: from,
                  _email: null,
                  _avatar: null,
                  _owner: ownerId,
                },
              );
              if (leadErr) console.error("[meta-wa-webhook] upsert lead failed", leadErr);

              // 2. Mirror into the unified omni-channel chat feed.
              const ts = m?.timestamp
                ? new Date(Number(m.timestamp) * 1000).toISOString()
                : new Date().toISOString();
              const { error: msgErr } = await admin.rpc("record_interaction_message", {
                _lead_id: leadId ?? null,
                _platform: "whatsapp",
                _direction: "inbound",
                _sender_type: "voter",
                _content: String(content),
                _external_id: String(m?.id ?? ""),
                _created_at: ts,
                _metadata: {
                  source: "meta_wa_webhook",
                  owner_id: ownerId,
                  phone_number_id: phoneNumberId,
                  waba_id: wabaId,
                  wa_from: from,
                  profile_name: profileName,
                  message_type: type,
                  raw: m,
                },
              });
              if (msgErr) console.error("[meta-wa-webhook] record message failed", msgErr);
            } catch (inner) {
              console.error("[meta-wa-webhook] message handling error", inner);
            }
          }
          continue;
        }

        if (
          ![
            "account_update",
            "phone_number_name_update",
            "phone_number_quality_update",
            "account_review_update",
            "business_capability_update",
          ].includes(field)
        ) {
          continue; // message events belong to whatsapp-webhook
        }

        // Resolve the tenant row by WABA ID, falling back to phone number id.
        const phoneNumberId = String(
          value?.phone_number_id ?? value?.metadata?.phone_number_id ?? "",
        );
        const { data: rows } = await admin
          .from("wa_providers")
          .select("id, config")
          .eq("provider_name", "WBA");

        const target = (rows ?? []).find((row: { config: Cfg }) => {
          const cfg = (row.config ?? {}) as Cfg;
          return (
            (wabaId && String(cfg.waba_id ?? "") === wabaId) ||
            (phoneNumberId && String(cfg.phone_number_id ?? "") === phoneNumberId)
          );
        }) as { id: string; config: Cfg } | undefined;

        const event = String(value?.event ?? "").toUpperCase();
        const patch: Cfg = {
          last_webhook_field: field,
          last_webhook_event: value?.event ?? null,
          last_webhook_at: new Date().toISOString(),
        };

        if (field === "account_update") {
          if (["VERIFIED", "APPROVED", "PARTNER_ADDED", "ACCOUNT_VERIFIED"].includes(event)) {
            patch.authorized = true;
            patch.registration_status = "CONNECTED";
            patch.code_verification_status = "VERIFIED";
            patch.authorized_at = new Date().toISOString();
            patch.last_error = null;
          }
          if (["DISABLED_UPDATE", "ACCOUNT_RESTRICTION", "ACCOUNT_DELETED", "BAN"].includes(event)) {
            patch.authorized = false;
            patch.registration_status = "RESTRICTED";
            patch.last_error = "חשבון ה-WhatsApp Business הוגבל על ידי Meta — נדרש אימות עסקי.";
            patch.last_error_at = new Date().toISOString();
          }
          if (value?.ban_info) patch.ban_info = value.ban_info;
          if (value?.restriction_info) patch.restriction_info = value.restriction_info;
        }

        if (field === "phone_number_name_update") {
          patch.verified_name = value?.decision === "APPROVED" ? value?.requested_verified_name ?? null : null;
          patch.name_status = value?.decision ?? null;
          patch.display_phone_number = value?.display_phone_number ?? null;
        }

        if (field === "phone_number_quality_update") {
          patch.quality_rating = value?.current_limit ?? value?.event ?? null;
        }

        if (field === "account_review_update") {
          patch.account_review_status = value?.decision ?? null;
          if (String(value?.decision ?? "").toUpperCase() === "REJECTED") {
            patch.last_error = "בקשת האימות העסקי נדחתה על ידי Meta.";
            patch.last_error_at = new Date().toISOString();
          }
        }

        if (patch.last_error) {
          await logIntegrationError({
            integration: "whatsapp",
            functionName: "meta-wa-webhook",
            errorMessage: String(patch.last_error),
            context: { field, value, waba_id: wabaId },
          });
        }

        if (target) {
          await admin
            .from("wa_providers")
            .update({ config: { ...(target.config ?? {}), ...patch } })
            .eq("id", target.id);
        }
      }
    }
  } catch (e) {
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "meta-wa-webhook",
      errorMessage: e instanceof Error ? e.message : String(e),
      context: { payload_keys: Object.keys(payload ?? {}) },
    });
  }

  // Meta requires a fast 200 regardless of internal processing outcome.
  return json({ received: true });
});
