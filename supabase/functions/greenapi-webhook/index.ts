/**
 * greenapi-webhook — DEPRECATED for messaging.
 * ────────────────────────────────────────────
 * WhatsApp chat and the /inbox experience run EXCLUSIVELY on the Official
 * WhatsApp Business API (Meta Cloud API). Inbound conversations arrive only via
 * `whatsapp-webhook` / `meta-wa-webhook` using Meta's official payload shape
 * (`object=whatsapp_business_account`, `entry[].changes[].value.messages[]`),
 * and every outbound message leaves through `send-whatsapp` → graph.facebook.com.
 *
 * This endpoint is intentionally inert for message traffic: it NEVER creates
 * leads, NEVER writes into `messages` / `chat_history`, and NEVER triggers the
 * AI autopilot. Message notifications are acknowledged (200, so the legacy
 * provider stops retrying) and dropped.
 *
 * The only thing still honoured is `stateInstanceChanged`, which keeps the
 * auxiliary (non-messaging) session-status field in sync for the avatar
 * enrichment tooling. That path is fully decoupled from chat.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { mapStateToStatus } from "../_shared/greenApi.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Auxiliary only: session status for avatar enrichment. No chat side effects. */
async function handleStateChange(admin: any, payload: any) {
  const instanceId = String(payload?.instanceData?.idInstance ?? "");
  const state = String(payload?.stateInstance ?? "");
  if (!instanceId) return { ok: true, ignored: "no_instance" };
  const status = mapStateToStatus(state, true);
  await admin
    .from("workspace_whatsapp_settings")
    .update({ qr_status: status, last_checked_at: new Date().toISOString() })
    .eq("green_api_instance_id", instanceId)
    .then(() => {}, () => {});
  return { ok: true, instance_id: instanceId, qr_status: status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      ok: true,
      function: "greenapi-webhook",
      status: "deprecated_for_messaging",
      messaging_provider: "meta_cloud_api_only",
      official_inbound_webhook: `${SUPABASE_URL}/functions/v1/whatsapp-webhook`,
      handles: ["stateInstanceChanged"],
    });
  }

  if (req.method !== "POST") return json({ ok: true, ignored: "method_not_post" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: true, ignored: "unparsable_body" });
  }

  const type = String(payload?.typeWebhook ?? "");
  try {
    if (type === "stateInstanceChanged") {
      const result = await handleStateChange(admin, payload);
      console.log("[greenapi-webhook] session status only", JSON.stringify(result));
      return json({ received: true, type, ...result });
    }

    // Any message-shaped notification is rejected by design.
    console.log(
      `[greenapi-webhook] dropped '${type}' — WhatsApp messaging is Meta Cloud API only`,
    );
    return json({
      received: true,
      type,
      ignored: "messaging_disabled_meta_cloud_api_only",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[greenapi-webhook] handler error", message, stack ?? "");
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "greenapi-webhook",
      errorMessage: `${message}${stack ? `\n${stack}` : ""}`,
      context: { webhook_type: type },
    });
    return json({ received: true, type, error: message });
  }
});
