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
    const expected = Deno.env.get("MESSENGER_VERIFY_TOKEN") ?? "";
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
