import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GREEN_API_BASE = "https://api.green-api.com";
const WEBHOOK_FUNCTION_NAME = "greenapi-webhook";

type GreenCredentials = {
  source: "workspace_settings" | "api_configs" | "social_connections";
  instanceId: string;
  token: string;
  apiConfigId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function splitGreenApiKey(value: unknown): { instanceId: string; token: string } | null {
  const raw = String(value ?? "").trim();
  if (!raw.includes(":")) return null;
  const [instanceId, ...tokenParts] = raw.split(":");
  const token = tokenParts.join(":").trim();
  if (!instanceId.trim() || !token) return null;
  return { instanceId: instanceId.trim(), token };
}

async function requireAdmin(req: Request, supabaseUrl: string, serviceKey: string) {
  const token = authToken(req);
  if (!token) throw new Error("missing_authorization");

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user?.id) throw new Error("invalid_session");

  const { data: roleOk, error: roleError } = await admin.rpc("is_admin_or_above", {
    _uid: userData.user.id,
  });
  if (roleError || roleOk !== true) throw new Error("admin_required");
  return { admin, userId: userData.user.id };
}

async function resolveGreenCredentials(admin: ReturnType<typeof createClient>): Promise<GreenCredentials | null> {
  // Modern path: per-workspace QR-session credentials.
  const { data: wsRows } = await admin
    .from("workspace_whatsapp_settings")
    .select("green_api_instance_id, green_api_token, qr_status, updated_at")
    .not("green_api_instance_id", "is", null)
    .not("green_api_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  const ws = ((wsRows ?? []) as any[]).find((r) => r.qr_status === "connected") ?? ((wsRows ?? []) as any[])[0];
  if (ws?.green_api_instance_id && ws?.green_api_token) {
    return {
      source: "workspace_settings",
      instanceId: String(ws.green_api_instance_id).trim(),
      token: String(ws.green_api_token).trim(),
    };
  }

  const { data: apiConfig } = await admin
    .from("api_configs")
    .select("id, api_key")
    .eq("service_name", "Green API")
    .eq("is_active", true)
    .maybeSingle();

  const legacy = splitGreenApiKey((apiConfig as any)?.api_key);
  if (legacy) {
    return {
      source: "api_configs",
      instanceId: legacy.instanceId,
      token: legacy.token,
      apiConfigId: (apiConfig as any)?.id,
    };
  }

  const { data: social } = await admin
    .from("social_connections")
    .select("credentials")
    .eq("platform", "whatsapp_green")
    .eq("is_connected", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const credentials = ((social as any)?.credentials ?? {}) as Record<string, unknown>;
  const instanceId = String(credentials.instance_id ?? credentials.instanceId ?? "").trim();
  const token = String(credentials.token ?? credentials.api_token ?? credentials.apiToken ?? "").trim();
  if (instanceId && token) return { source: "social_connections", instanceId, token };

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) return json({ error: "server_misconfigured" }, 500);

    const webhookUrl = `${supabaseUrl}/functions/v1/${WEBHOOK_FUNCTION_NAME}`;
    const { admin, userId } = await requireAdmin(req, supabaseUrl, serviceKey);
    const creds = await resolveGreenCredentials(admin);
    if (!creds) {
      return json({
        ok: false,
        error: "greenapi_not_configured",
        webhook_url: webhookUrl,
        auth_required_for_webhook: false,
      }, 400);
    }

    if (req.method === "GET") {
      const settingsRes = await fetch(`${GREEN_API_BASE}/waInstance${creds.instanceId}/getSettings/${creds.token}`);
      const settings = await settingsRes.json().catch(() => ({}));
      return json({
        ok: settingsRes.ok,
        webhook_url: webhookUrl,
        auth_required_for_webhook: false,
        greenapi: {
          status: settingsRes.status,
          source: creds.source,
          current_webhook_url: settings?.webhookUrl ?? null,
          incomingWebhook: settings?.incomingWebhook ?? null,
          outgoingWebhook: settings?.outgoingWebhook ?? null,
          outgoingMessageWebhook: settings?.outgoingMessageWebhook ?? null,
          outgoingAPIMessageWebhook: settings?.outgoingAPIMessageWebhook ?? null,
          stateWebhook: settings?.stateWebhook ?? null,
        },
      }, settingsRes.ok ? 200 : 502);
    }

    const settingsPayload = {
      webhookUrl,
      webhookUrlToken: "",
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      outgoingMessageWebhook: "yes",
      outgoingAPIMessageWebhook: "yes",
      stateWebhook: "yes",
    };

    const syncRes = await fetch(`${GREEN_API_BASE}/waInstance${creds.instanceId}/setSettings/${creds.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsPayload),
    });
    const syncBody = await syncRes.json().catch(async () => ({ raw: await syncRes.text().catch(() => "") }));

    if (!syncRes.ok || syncBody?.saveSettings === false) {
      return json({
        ok: false,
        error: "greenapi_set_settings_failed",
        status: syncRes.status,
        webhook_url: webhookUrl,
        greenapi_response: syncBody,
      }, 502);
    }

    if (creds.apiConfigId) {
      await admin
        .from("api_configs")
        .update({ webhook_url: webhookUrl, updated_at: new Date().toISOString() })
        .eq("id", creds.apiConfigId);
    }

    try {
      await admin.from("audit_logs").insert({
        actor_id: userId,
        action: "greenapi_webhook_synced",
        target_table: "api_configs",
        target_id: creds.apiConfigId ?? null,
        details: {
          provider: "GreenAPI",
          webhook_url: webhookUrl,
          credential_source: creds.source,
          requested_tracking_flags: {
            incomingMessageReceived: true,
            outboundMessageReceived: true,
            statusMessageReceived: true,
          },
        },
      });
    } catch (e) {
      console.warn("greenapi-webhook-sync audit failed", e);
    }

    return json({
      ok: true,
      webhook_url: webhookUrl,
      auth_required_for_webhook: false,
      greenapi_response: syncBody,
      applied_settings: settingsPayload,
      requested_tracking_flags: {
        incomingMessageReceived: true,
        outboundMessageReceived: true,
        statusMessageReceived: true,
      },
      note: "GreenAPI may take up to 5 minutes to apply webhook settings.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    const status = message === "admin_required" ? 403 : message.includes("authorization") || message.includes("session") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});