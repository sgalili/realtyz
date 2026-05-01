// System Health Watchdog
// Runs on a cron schedule. For each monitored integration, counts failures in
// the last 5 minutes. If >= 3 failures and we haven't alerted recently
// (cooldown), sends an urgent alert via WhatsApp (Green API) and email
// (Resend, if configured) to the configured admin contacts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FAILURE_THRESHOLD = 3;
const WINDOW_MINUTES = 5;

const INTEGRATION_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  homely: "Homely",
  transcription: "Transcription",
  ai_gateway: "AI Gateway",
  email_queue: "Email Queue",
};

async function sendWhatsAppAlert(
  sb: ReturnType<typeof createClient>,
  toPhone: string,
  body: string,
): Promise<void> {
  // Reuse the configured Green API credentials (api_configs table).
  const { data: cfg } = await sb
    .from("api_configs")
    .select("provider, config")
    .eq("provider", "green_api")
    .maybeSingle();
  const c = (cfg?.config ?? {}) as Record<string, string>;
  const instanceId = c.instance_id || c.instanceId;
  const token = c.token || c.api_token;
  if (!instanceId || !token) return;

  await fetch(
    `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${toPhone}@c.us`, message: body }),
    },
  ).catch(() => {});
}

async function sendEmailAlert(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Realtyz Watchdog <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: settings } = await sb
    .from("system_health_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const monitored: string[] = settings?.monitored_integrations ?? [];
  const cooldownMs = (settings?.alert_cooldown_minutes ?? 30) * 60_000;
  const alertEmail: string | null = settings?.alert_email ?? null;
  const alertPhone: string | null = settings?.alert_whatsapp_phone ?? null;

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const results: Array<{ integration: string; alerted: boolean; failures: number }> = [];

  for (const integration of monitored) {
    const { count } = await sb
      .from("integration_error_logs")
      .select("id", { count: "exact", head: true })
      .eq("integration", integration)
      .gte("created_at", since);
    const failures = count ?? 0;

    const { data: state } = await sb
      .from("integration_alert_state")
      .select("*")
      .eq("integration", integration)
      .maybeSingle();

    const lastAlertedAt = state?.last_alerted_at
      ? new Date(state.last_alerted_at).getTime()
      : 0;
    const inCooldown = Date.now() - lastAlertedAt < cooldownMs;

    if (failures >= FAILURE_THRESHOLD && !inCooldown) {
      const label = INTEGRATION_LABEL[integration] ?? integration;
      const subject = `🚨 Realtyz Alert: ${label} integration down`;
      const body =
        `🚨 התראת מערכת Realtyz\n\nהאינטגרציה ${label} נכשלה ${failures} פעמים ב-${WINDOW_MINUTES} הדקות האחרונות.\n` +
        `יש לבדוק את ה-Settings ואת לוגי ה-Edge Functions בהקדם.`;

      if (alertPhone) await sendWhatsAppAlert(sb, alertPhone, body);
      if (alertEmail) await sendEmailAlert(alertEmail, subject, body);

      await sb.from("integration_alert_state").upsert({
        integration,
        last_alerted_at: new Date().toISOString(),
        is_alerting: true,
        updated_at: new Date().toISOString(),
      });
      results.push({ integration, alerted: true, failures });
    } else if (failures === 0 && state?.is_alerting) {
      await sb.from("integration_alert_state").upsert({
        integration,
        last_recovered_at: new Date().toISOString(),
        is_alerting: false,
        updated_at: new Date().toISOString(),
      });
      results.push({ integration, alerted: false, failures });
    } else {
      results.push({ integration, alerted: false, failures });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
