/**
 * meta-wa-register
 * ────────────────
 * Official Meta WhatsApp Cloud API phone-number authorization handler.
 *
 * Actions (POST { action, ... }):
 *   save          → store WABA ID / Phone Number ID / Access Token on wa_providers (WBA row)
 *   status        → read live number status from Graph API (verification + registration)
 *   request_code  → ask Meta to send the 6-digit verification code (SMS | VOICE)
 *   verify_code   → submit the code, then register the number with a 6-digit PIN
 *                   and subscribe the app to the WABA so webhooks start flowing
 *   subscribe     → (re)subscribe the app to the WABA webhooks
 *
 * All Graph errors are logged to integration_error_logs and returned to the UI
 * with a Hebrew message so business-verification roadblocks are visible.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const DEFAULT_API_VERSION = "v21.0";

const BodySchema = z.object({
  action: z.enum(["save", "status", "request_code", "verify_code", "subscribe"]),
  waba_id: z.string().min(3).max(64).optional(),
  phone_number_id: z.string().min(3).max(64).optional(),
  access_token: z.string().min(20).max(4000).optional(),
  api_version: z.string().regex(/^v\d+\.\d+$/).optional(),
  code_method: z.enum(["SMS", "VOICE"]).optional(),
  language: z.string().min(2).max(8).optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Cfg = Record<string, unknown>;

/** Human-readable Hebrew message for the most common Meta Graph errors. */
function hebrewError(err: { code?: number; error_subcode?: number; message?: string } | null): string {
  const code = Number(err?.code ?? 0);
  const sub = Number(err?.error_subcode ?? 0);
  if (code === 190) return "טוקן הגישה של Meta פג תוקף או בוטל — יש להנפיק טוקן חדש באפליקציית Meta.";
  if (code === 200 || code === 10) return "לאפליקציית Meta אין הרשאות (whatsapp_business_management / whatsapp_business_messaging) על החשבון.";
  if (code === 100 && sub === 33) return "מזהה מספר או WABA לא נמצא — ודא שה-Phone Number ID וה-WABA ID נכונים.";
  if (code === 100) return "פרמטר שגוי בבקשה ל-Meta — בדוק את מזהי החשבון והמספר.";
  if (code === 131000 || code === 368) return "החשבון העסקי מוגבל או ממתין לאימות עסקי ב-Meta Business Manager.";
  if (code === 133005) return "קוד ה-PIN שגוי — אם הופעל אימות דו-שלבי, יש לאפס אותו ב-Meta.";
  if (code === 133008) return "יותר מדי ניסיונות אימות — יש להמתין לפני ניסיון נוסף.";
  if (code === 133010) return "המספר אינו רשום עדיין — יש להשלים את אימות הקוד לפני הרישום.";
  if (code === 133016 || code === 133006) return "המספר דורש אימות מחדש מול Meta לפני שניתן לרשום אותו.";
  return err?.message ? `Meta: ${err.message}` : "שגיאה לא ידועה מול Meta Graph API.";
}

async function graph(
  path: string,
  token: string,
  apiVersion: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<{ ok: boolean; status: number; data: any; error: any }> {
  const url = `https://graph.facebook.com/${apiVersion}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok && !data?.error, status: res.status, data, error: data?.error ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ── Auth: this endpoint mutates tenant credentials, so a real user is required.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const input = parsed.data;

  // ── Load (or create) the tenant's WBA provider row.
  const { data: existing } = await admin
    .from("wa_providers")
    .select("id, config, is_active")
    .eq("user_id", userId)
    .eq("provider_name", "WBA")
    .maybeSingle();

  const cfg: Cfg = { ...((existing?.config as Cfg) ?? {}) };

  const wabaId = String(input.waba_id ?? cfg.waba_id ?? Deno.env.get("META_WABA_ID") ?? "");
  let phoneNumberId = String(
    input.phone_number_id ?? cfg.phone_number_id ?? Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? "",
  ).trim();

  const accessToken = String(
    input.access_token ?? cfg.access_token ?? Deno.env.get("META_WA_ACCESS_TOKEN") ?? "",
  );
  const apiVersion = String(input.api_version ?? cfg.api_version ?? DEFAULT_API_VERSION);

  const persist = async (patch: Cfg) => {
    const next = { ...cfg, ...patch, api_version: apiVersion, updated_at: new Date().toISOString() };
    if (existing?.id) {
      await admin.from("wa_providers").update({ config: next }).eq("id", existing.id);
    } else {
      await admin.from("wa_providers").insert({
        user_id: userId,
        provider_name: "WBA",
        is_official: true,
        is_active: true,
        config: next,
      });
    }
    return next;
  };

  const fail = async (message: string, details?: unknown, status = 400) => {
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "meta-wa-register",
      errorMessage: message,
      context: { action: input.action, phone_number_id: phoneNumberId, waba_id: wabaId, details },
    });
    await persist({ last_error: message, last_error_at: new Date().toISOString() });
    return json({ success: false, error: message, details: details ?? null }, status);
  };

  // ── Users often paste the actual phone number (e.g. "+972537983832") into the
  // Phone Number ID field. Graph rejects that with code 100/subcode 33.
  // Resolve it to the real numeric node ID via the WABA's phone_numbers edge.
  const looksLikePhoneNumber = phoneNumberId.startsWith("+") || phoneNumberId.length < 10;
  if (phoneNumberId && accessToken && wabaId && looksLikePhoneNumber) {
    const digits = phoneNumberId.replace(/\D/g, "");
    const list = await graph(
      `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      accessToken,
      apiVersion,
    );
    if (list.ok && Array.isArray(list.data?.data)) {
      const match = list.data.data.find(
        (p: { display_phone_number?: string }) =>
          String(p.display_phone_number ?? "").replace(/\D/g, "") === digits,
      );
      if (match?.id) phoneNumberId = String(match.id);
    }
    if (phoneNumberId !== String(input.phone_number_id ?? phoneNumberId)) {
      await persist({ phone_number_id: phoneNumberId });
    }
  }



  if (phoneNumberId.startsWith("+")) {
    return await fail(
      "השדה Phone Number ID חייב להכיל את מזהה המספר המספרי מ-Meta (לא את מספר הטלפון עצמו). ניתן למצוא אותו ב-WhatsApp Manager ליד המספר.",
    );
  }

  try {

    // ── save ────────────────────────────────────────────────────────────────
    if (input.action === "save") {
      if (!wabaId || !phoneNumberId || !accessToken) {
        return json({ success: false, error: "חסרים WABA ID / Phone Number ID / Access Token" }, 400);
      }
      const next = await persist({
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        last_error: null,
      });
      return json({ success: true, config: publicCfg(next) });
    }

    if (!phoneNumberId || !accessToken) {
      return json({ success: false, error: "יש לשמור קודם Phone Number ID ו-Access Token" }, 400);
    }

    // ── status ──────────────────────────────────────────────────────────────
    if (input.action === "status") {
      const r = await graph(
        `/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status,status,platform_type`,
        accessToken,
        apiVersion,
      );
      if (!r.ok) return await fail(hebrewError(r.error), r.error);

      // Webhook subscription state (best-effort, requires WABA ID).
      let subscribed: boolean | null = null;
      if (wabaId) {
        const s = await graph(`/${wabaId}/subscribed_apps`, accessToken, apiVersion);
        if (s.ok) subscribed = Array.isArray(s.data?.data) && s.data.data.length > 0;
      }

      const authorized =
        String(r.data?.code_verification_status ?? "").toUpperCase() === "VERIFIED" &&
        String(r.data?.status ?? "").toUpperCase() === "CONNECTED";

      const next = await persist({
        display_phone_number: r.data?.display_phone_number ?? null,
        verified_name: r.data?.verified_name ?? null,
        code_verification_status: r.data?.code_verification_status ?? null,
        quality_rating: r.data?.quality_rating ?? null,
        name_status: r.data?.name_status ?? null,
        registration_status: r.data?.status ?? null,
        webhook_subscribed: subscribed,
        authorized,
        authorized_at: authorized ? (cfg.authorized_at ?? new Date().toISOString()) : null,
        last_checked_at: new Date().toISOString(),
        last_error: null,
      });
      return json({ success: true, authorized, config: publicCfg(next) });
    }

    // ── request_code ────────────────────────────────────────────────────────
    if (input.action === "request_code") {
      const r = await graph(`/${phoneNumberId}/request_code`, accessToken, apiVersion, {
        method: "POST",
        body: { code_method: input.code_method ?? "SMS", language: input.language ?? "he" },
      });
      if (!r.ok) return await fail(hebrewError(r.error), r.error);
      const next = await persist({
        code_requested_at: new Date().toISOString(),
        code_verification_status: "PENDING",
        last_error: null,
      });
      return json({ success: true, config: publicCfg(next) });
    }

    // ── verify_code (+ register + subscribe) ────────────────────────────────
    if (input.action === "verify_code") {
      if (!input.code) return json({ success: false, error: "חסר קוד אימות בן 6 ספרות" }, 400);

      const verify = await graph(`/${phoneNumberId}/verify_code`, accessToken, apiVersion, {
        method: "POST",
        body: { code: input.code },
      });
      if (!verify.ok) return await fail(hebrewError(verify.error), verify.error);

      // Register the number on the Cloud API with the 2FA PIN.
      const pin = input.pin ?? String(cfg.pin ?? "");
      if (!/^\d{6}$/.test(pin)) {
        await persist({ code_verification_status: "VERIFIED", last_error: null });
        return json({ success: false, error: "נדרש PIN בן 6 ספרות להשלמת הרישום", stage: "register" }, 400);
      }
      const register = await graph(`/${phoneNumberId}/register`, accessToken, apiVersion, {
        method: "POST",
        body: { messaging_product: "whatsapp", pin },
      });
      if (!register.ok) return await fail(hebrewError(register.error), register.error);

      // Subscribe the app so status/message webhooks arrive.
      let subscribed: boolean | null = null;
      if (wabaId) {
        const sub = await graph(`/${wabaId}/subscribed_apps`, accessToken, apiVersion, { method: "POST" });
        subscribed = !!sub.ok;
      }

      const next = await persist({
        pin,
        waba_id: wabaId || null,
        code_verification_status: "VERIFIED",
        registration_status: "CONNECTED",
        webhook_subscribed: subscribed,
        authorized: true,
        authorized_at: new Date().toISOString(),
        last_error: null,
      });
      if (existing?.id) {
        await admin.from("wa_providers").update({ is_active: true, is_official: true }).eq("id", existing.id);
      }
      return json({ success: true, authorized: true, config: publicCfg(next) });
    }

    // ── subscribe ───────────────────────────────────────────────────────────
    if (input.action === "subscribe") {
      if (!wabaId) return json({ success: false, error: "חסר WABA ID" }, 400);
      const sub = await graph(`/${wabaId}/subscribed_apps`, accessToken, apiVersion, { method: "POST" });
      if (!sub.ok) return await fail(hebrewError(sub.error), sub.error);
      const next = await persist({ webhook_subscribed: true, last_error: null });
      return json({ success: true, config: publicCfg(next) });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return await fail(`שגיאת שרת: ${message}`, null, 500);
  }
});

/** Never leak the access token / PIN back to the browser. */
function publicCfg(cfg: Cfg) {
  const token = String(cfg.access_token ?? "");
  return {
    waba_id: cfg.waba_id ?? null,
    phone_number_id: cfg.phone_number_id ?? null,
    access_token_masked: token ? `${token.slice(0, 4)}••••${token.slice(-4)}` : null,
    has_pin: !!cfg.pin,
    api_version: cfg.api_version ?? DEFAULT_API_VERSION,
    display_phone_number: cfg.display_phone_number ?? null,
    verified_name: cfg.verified_name ?? null,
    code_verification_status: cfg.code_verification_status ?? null,
    registration_status: cfg.registration_status ?? null,
    quality_rating: cfg.quality_rating ?? null,
    name_status: cfg.name_status ?? null,
    webhook_subscribed: cfg.webhook_subscribed ?? null,
    authorized: !!cfg.authorized,
    authorized_at: cfg.authorized_at ?? null,
    code_requested_at: cfg.code_requested_at ?? null,
    last_checked_at: cfg.last_checked_at ?? null,
    last_error: cfg.last_error ?? null,
    last_error_at: cfg.last_error_at ?? null,
  };
}
