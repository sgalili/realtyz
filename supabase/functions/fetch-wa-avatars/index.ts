// fetch-wa-avatars
// ────────────────
// Hybrid WhatsApp architecture:
//   • Messaging + webhooks  → official Meta WhatsApp Business Cloud API.
//   • Contact avatars ONLY  → Green API (Meta exposes no contact-photo endpoint).
//
// This function is an auxiliary helper. Every Green API call is wrapped in a
// silent try/catch: if the instance is expired, unauthorized, unconfigured or
// simply errors out, we resolve successfully with `supported: false` so the UI
// degrades smoothly to initials avatars and never raises a toast.
//
// POST body (all optional): { lead_ids?: string[], force?: boolean, limit?: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const unsupported = (reason: string) =>
  json({
    success: true,
    supported: false,
    provider: "green-api",
    scanned: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    reasons: [],
    results: [],
    reason,
  });

type Creds = { instance: string; token: string };

/** Resolve Green API credentials from env → api_configs → social_connections. */
async function resolveCreds(admin: any): Promise<Creds | null> {
  const envInstance = Deno.env.get("GREEN_API_INSTANCE_ID");
  const envToken = Deno.env.get("GREEN_API_TOKEN");
  if (envInstance && envToken) {
    return { instance: envInstance.trim(), token: envToken.trim() };
  }

  try {
    const { data } = await admin
      .from("api_configs")
      .select("api_key, is_active")
      .eq("service_name", "Green API")
      .maybeSingle();
    const raw = String(data?.api_key ?? "");
    if (raw.includes(":")) {
      const [instance, ...rest] = raw.split(":");
      const token = rest.join(":");
      if (instance.trim() && token.trim()) {
        return { instance: instance.trim(), token: token.trim() };
      }
    }
  } catch { /* silent */ }

  try {
    const { data } = await admin
      .from("social_connections")
      .select("credentials")
      .eq("platform", "whatsapp_green")
      .limit(1);
    const creds = (data?.[0]?.credentials ?? {}) as Record<string, any>;
    const manual = (creds.manual ?? {}) as Record<string, any>;
    const instance = String(manual.instance_id ?? creds.instance_id ?? "").trim();
    const token = String(
      manual.api_token ?? manual.token ?? creds.api_token ?? creds.token ?? "",
    ).trim();
    if (instance && token) return { instance, token };
  } catch { /* silent */ }

  return null;
}

const toChatId = (phone: string | null | undefined): string | null => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const intl = digits.startsWith("972")
    ? digits
    : digits.startsWith("0")
    ? `972${digits.slice(1)}`
    : digits;
  return `${intl}@c.us`;
};

/** Single silent Green API avatar lookup. Never throws. */
async function getAvatar(creds: Creds, chatId: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12_000);
    const res = await fetch(
      `https://api.green-api.com/waInstance${creds.instance}/getAvatar/${creds.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
        signal: ctl.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({} as any));
    const url = String(data?.urlAvatar ?? "").trim();
    return url && data?.available !== false ? url : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const leadIds: string[] | undefined = Array.isArray(body?.lead_ids)
      ? body.lead_ids
      : undefined;
    const force = body?.force === true;
    const limit = Math.min(Number(body?.limit) || 50, 200);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const creds = await resolveCreds(admin);
    if (!creds) {
      return unsupported(
        "שירות תמונות הפרופיל אינו מוגדר — מוצגות ראשי תיבות במקום",
      );
    }

    // Silent health probe: an expired/unauthorized instance short-circuits.
    try {
      const state = await fetch(
        `https://api.green-api.com/waInstance${creds.instance}/getStateInstance/${creds.token}`,
      );
      const sd = await state.json().catch(() => ({} as any));
      if (!state.ok || sd?.stateInstance !== "authorized") {
        return unsupported(
          "שירות תמונות הפרופיל אינו זמין כרגע — מוצגות ראשי תיבות במקום",
        );
      }
    } catch {
      return unsupported(
        "שירות תמונות הפרופיל אינו זמין כרגע — מוצגות ראשי תיבות במקום",
      );
    }

    let query = admin
      .from("leads")
      .select("id, phone_number, profile_picture_url")
      .not("phone_number", "is", null)
      .limit(limit);
    if (leadIds?.length) query = query.in("id", leadIds);
    if (!force) query = query.is("profile_picture_url", null);

    const { data: rows, error } = await query;
    if (error) return unsupported("לא ניתן לטעון את רשימת אנשי הקשר כעת");

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      const chatId = toChatId(row.phone_number);
      if (!chatId) { skipped++; continue; }
      const url = await getAvatar(creds, chatId);
      if (!url) { failed++; continue; }
      try {
        const { error: upErr } = await admin
          .from("leads")
          .update({ profile_picture_url: url })
          .eq("id", row.id);
        if (upErr) failed++;
        else updated++;
      } catch {
        failed++;
      }
    }

    return json({
      success: true,
      supported: true,
      provider: "green-api",
      scanned: rows?.length ?? 0,
      updated,
      skipped,
      failed,
      errors: [],
      reasons: [],
      results: [],
    });
  } catch {
    // Absolute last resort — still a soft, toast-free response.
    return unsupported(
      "שירות תמונות הפרופיל אינו זמין כרגע — מוצגות ראשי תיבות במקום",
    );
  }
});
