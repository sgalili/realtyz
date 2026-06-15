import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Personalize message body using voter data
function personalize(
  template: string,
  ctx: {
    full_name?: string | null;
    city?: string | null;
    booth?: string | null;
  },
): string {
  const firstName = (ctx.full_name ?? "").trim().split(/\s+/)[0] || "חבר/ה יקר/ה";
  const city = (ctx.city ?? "").trim() || "אזורך";
  const booth = (ctx.booth ?? "").trim() || "הקלפי הקרובה אליך";
  return String(template ?? "")
    .replace(/\[שם_פרטי\]/g, firstName)
    .replace(/\[עיר\]/g, city)
    .replace(/\[קלפי\]/g, booth);
}

// Normalize to local Israeli format 05XXXXXXXX
function toLocalIL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  else if (d.startsWith("5") && d.length === 9) d = "0" + d;
  if (!/^05\d{8}$/.test(d)) return null;
  return d;
}

// 9725XXXXXXXX (no plus) for WhatsApp / Green API
function toIntlIL(raw: string | null | undefined): string | null {
  const local = toLocalIL(raw);
  if (!local) return null;
  return "972" + local.slice(1);
}

type SendResult = {
  ok: boolean;
  provider_message_id?: string | null;
  failure_reason?: string | null;
  raw?: unknown;
};

async function sendSms019(
  user: string,
  password: string,
  phone: string,
  body: string,
  source: string,
): Promise<SendResult> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user>
    <username>${escapeXml(user)}</username>
    <password>${escapeXml(password)}</password>
  </user>
  <source>${escapeXml(source || "Realtyz")}</source>
  <destinations>
    <phone>${escapeXml(phone)}</phone>
  </destinations>
  <message>${escapeXml(body)}</message>
</sms>`;

  try {
    const res = await fetch("https://www.019sms.co.il:8090/api", {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=UTF-8" },
      body: xml,
    });
    const text = await res.text();
    const status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);
    const messageId = text.match(/<message_id>(.*?)<\/message_id>/)?.[1] ?? null;
    if (status === 0) {
      return { ok: true, provider_message_id: messageId };
    }
    const errorMsg =
      text.match(/<message>(.*?)<\/message>/)?.[1] ?? `019 status ${status}`;
    return { ok: false, failure_reason: errorMsg };
  } catch (e: any) {
    return { ok: false, failure_reason: `019 network: ${e?.message ?? e}` };
  }
}

async function sendWhatsAppGreen(
  _instanceId: string,
  _token: string,
  intlPhone: string,
  body: string,
  routerCtx?: { supabaseUrl: string; serviceRoleKey: string; userId: string | null },
): Promise<SendResult> {
  // Route via the unified send-whatsapp gateway (WBA → GreenAPI fallback).
  // We keep the legacy parameter signature for back-compat at call sites.
  if (!routerCtx) {
    return { ok: false, failure_reason: "router context missing" };
  }
  try {
    const res = await fetch(`${routerCtx.supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${routerCtx.serviceRoleKey}`,
        apikey: routerCtx.serviceRoleKey,
      },
      body: JSON.stringify({
        phone_number: intlPhone,
        message: body,
        // tenant_id falls back to the campaign owner so wa_providers can be looked up server-side.
        tenant_id: routerCtx.userId ?? undefined,
      }),
    });
    const json = await res.json().catch(() => ({} as any));
    if (res.ok && json?.success) {
      return { ok: true, provider_message_id: json.message_id ?? null };
    }
    return {
      ok: false,
      failure_reason: json?.error ?? `send-whatsapp HTTP ${res.status}`,
    };
  } catch (e: any) {
    return { ok: false, failure_reason: `send-whatsapp network: ${e?.message ?? e}` };
  }
}

// Resend removed - email sending now goes through the user's connected Gmail (OAuth via /social-connect).

// Load the user's per-user Green API (WhatsApp) credentials from social_connections.
// Falls back to the shared admin api_configs row if the user hasn't configured their own.
type WhatsAppSession = {
  source: "user" | "shared";
  instanceId: string;
  apiToken: string;
  accountName?: string;
};
async function loadUserWhatsAppSession(
  admin: any,
  userId: string,
  sharedFallback: { instance: string; token: string } | null,
): Promise<{ session: WhatsAppSession | null; reason: string | null }> {
  const { data: row, error } = await admin
    .from("social_connections")
    .select("id, credentials, is_connected, created_by")
    .eq("platform", "whatsapp_green")
    .eq("created_by", userId)
    .maybeSingle();
  if (!error && row) {
    const creds = (row.credentials ?? {}) as Record<string, any>;
    const manual = (creds.manual ?? {}) as Record<string, any>;
    // Accept both naming conventions: api_token (UI) and token (legacy test fn).
    const instanceId = (manual.instance_id as string | undefined) ?? "";
    const apiToken =
      (manual.api_token as string | undefined) ??
      (manual.token as string | undefined) ??
      "";
    if (instanceId && apiToken) {
      return {
        session: {
          source: "user",
          instanceId,
          apiToken,
          accountName: creds.account_name as string | undefined,
        },
        reason: null,
      };
    }
  }
  if (sharedFallback?.instance && sharedFallback?.token) {
    return {
      session: {
        source: "shared",
        instanceId: sharedFallback.instance,
        apiToken: sharedFallback.token,
      },
      reason: null,
    };
  }
  return { session: null, reason: "whatsapp_not_connected" };
}


// base64url encoding (Deno-safe, supports unicode)
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Gmail free accounts: ~500/day. Workspace: ~2000/day.
// Default to safe lower bound — can be overridden per connection via credentials.daily_send_limit.
const GMAIL_DEFAULT_DAILY_LIMIT = 500;
const GMAIL_WORKSPACE_DAILY_LIMIT = 2000;

type GmailSession = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  fromAddress: string;
  dailyLimit: number;
};

async function loadUserGmailSessions(
  admin: any,
  userId: string,
): Promise<{ sessions: GmailSession[]; reason: string | null }> {
  // Load ALL connected Gmail accounts for this user (multi-account distribution).
  // Both 'gmail' and legacy 'google' platform identifiers are supported.
  const { data: rows, error } = await admin
    .from("social_connections")
    .select("id, credentials, is_connected, encrypted_session, created_by, platform")
    .in("platform", ["gmail", "google"])
    .eq("created_by", userId)
    .eq("is_connected", true);

  if (error) return { sessions: [], reason: `gmail lookup: ${error.message}` };
  if (!rows || rows.length === 0) return { sessions: [], reason: "gmail_not_connected" };

  const sessions: GmailSession[] = [];
  for (const row of rows) {
    const creds = (row.credentials ?? {}) as Record<string, any>;
    const manual = (creds.manual ?? {}) as Record<string, any>;
    const accessToken = manual.access_token as string | undefined;
    const refreshToken = (manual.refresh_token as string | undefined) ?? null;
    const fromAddress =
      (creds.verified_identity?.email as string | undefined) ??
      (creds.account_name as string | undefined) ??
      "";
    if (!accessToken || !fromAddress) continue;

    const isWorkspace = !!fromAddress && !/@gmail\.com$/i.test(fromAddress);
    const overrideLimit = Number(manual.daily_send_limit ?? 0);
    const dailyLimit =
      overrideLimit > 0
        ? overrideLimit
        : isWorkspace
          ? GMAIL_WORKSPACE_DAILY_LIMIT
          : GMAIL_DEFAULT_DAILY_LIMIT;

    sessions.push({
      connectionId: row.id,
      accessToken,
      refreshToken,
      clientId: (manual.oauth_client_id as string | undefined) ?? null,
      clientSecret: (manual.oauth_client_secret as string | undefined) ?? null,
      fromAddress,
      dailyLimit,
    });
  }
  if (sessions.length === 0) return { sessions: [], reason: "gmail_token_missing" };
  return { sessions, reason: null };
}

// Backward-compat single-session helper (returns first available account).
async function loadUserGmailSession(
  admin: any,
  userId: string,
): Promise<{ session: GmailSession | null; reason: string | null }> {
  const { sessions, reason } = await loadUserGmailSessions(admin, userId);
  return { session: sessions[0] ?? null, reason: sessions.length > 0 ? null : reason };
}

// ---- Resend (bulk-friendly, verified domain) -------------------------------
// Used automatically when recipient count > BULK_RESEND_THRESHOLD or when the
// caller explicitly requests prefer_resend=true. Protects personal Gmail
// accounts from being flagged for spam by routing high-volume blasts through
// a verified sending domain.
const BULK_RESEND_THRESHOLD = 100;

async function sendEmailResend(
  apiKey: string,
  fromAddress: string,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html: htmlBody,
      }),
    });
    const json = await res.json().catch(() => ({} as any));
    if (res.ok && json?.id) {
      return { ok: true, provider_message_id: json.id };
    }
    return {
      ok: false,
      failure_reason: json?.message ?? json?.error ?? `Resend HTTP ${res.status}`,
    };
  } catch (e: any) {
    return { ok: false, failure_reason: `Resend network: ${e?.message ?? e}` };
  }
}

// ---- Unsubscribe link (CAN-SPAM / GDPR compliance) -------------------------
// Auto-appended to EVERY outbound email so recipients always have a one-click
// removal path. Lowers spam-rate complaints and protects sender reputation.
function buildUnsubscribeLink(recipientEmail: string, campaignName: string): string {
  const base = (Deno.env.get("PUBLIC_SITE_URL") ?? "").replace(/\/+$/, "");
  if (!base) {
    throw new Error("PUBLIC_SITE_URL secret is not configured — required to build unsubscribe links.");
  }
  const params = new URLSearchParams({ email: recipientEmail, c: campaignName });
  return `${base}/unsubscribe?${params.toString()}`;
}

function appendUnsubscribeFooter(htmlBody: string, recipientEmail: string, campaignName: string): string {
  const link = buildUnsubscribeLink(recipientEmail, campaignName);
  const footer = `
    <hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0" />
    <div dir="rtl" style="margin-top:12px;font-family:Assistant,Arial,sans-serif;font-size:12px;color:#64748b;text-align:center">
      קיבלת הודעה זו כחלק ממאגר התומכים של Realtyz. אם אינך מעוניין/ת לקבל הודעות נוספות,
      <a href="${link}" style="color:#0369a1;text-decoration:underline">לחצ/י כאן להסרה</a>.
    </div>`;
  return htmlBody + footer;
}

// ---- Safe-send batching helpers --------------------------------------------
// Random delay between intra-batch sends (anti-spam jitter).
function randomDelayMs(minSec: number, maxSec: number): number {
  const lo = Math.max(0, minSec) * 1000;
  const hi = Math.max(lo, maxSec * 1000);
  return Math.floor(lo + Math.random() * (hi - lo));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshGmailAccessToken(
  admin: any,
  session: GmailSession,
): Promise<string | null> {
  if (!session.refreshToken || !session.clientId || !session.clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: session.clientId,
        client_secret: session.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || !json?.access_token) {
      console.error("gmail refresh failed", res.status, json);
      return null;
    }
    const newToken = String(json.access_token);
    // Persist new token back to the connection row
    const { data: existing } = await admin
      .from("social_connections")
      .select("credentials")
      .eq("id", session.connectionId)
      .maybeSingle();
    const prevCreds = (existing?.credentials ?? {}) as Record<string, any>;
    const prevManual = (prevCreds.manual ?? {}) as Record<string, any>;
    await admin
      .from("social_connections")
      .update({
        credentials: {
          ...prevCreds,
          manual: { ...prevManual, access_token: newToken },
        },
      })
      .eq("id", session.connectionId);
    session.accessToken = newToken;
    return newToken;
  } catch (e) {
    console.error("gmail refresh exception", e);
    return null;
  }
}

async function gmailSendOnce(
  accessToken: string,
  fromAddress: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ status: number; json: any }> {
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const html = `<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`;
  const message = [
    `From: ${fromAddress}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
  ].join("\r\n");
  const raw = base64UrlEncode(message);
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  const json = await res.json().catch(() => ({} as any));
  return { status: res.status, json };
}

async function sendEmailUserGmail(
  admin: any,
  session: GmailSession,
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  try {
    let { status, json } = await gmailSendOnce(
      session.accessToken,
      session.fromAddress,
      to,
      subject,
      body,
    );
    // Auto-refresh on 401
    if (status === 401) {
      const newToken = await refreshGmailAccessToken(admin, session);
      if (!newToken) {
        return {
          ok: false,
          failure_reason:
            "Gmail token expired - reconnect at /social-connect",
        };
      }
      ({ status, json } = await gmailSendOnce(
        newToken,
        session.fromAddress,
        to,
        subject,
        body,
      ));
    }
    if (status >= 200 && status < 300 && json?.id) {
      return { ok: true, provider_message_id: json.id };
    }
    return {
      ok: false,
      failure_reason:
        json?.error?.message ?? json?.message ?? `Gmail HTTP ${status}`,
    };
  } catch (e: any) {
    return { ok: false, failure_reason: `Gmail network: ${e?.message ?? e}` };
  }
}

async function gmailDailyUsedToday(admin: any, userId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("campaign_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", "email")
    .eq("status", "sent")
    .gte("sent_at", since.toISOString());
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode: "test" | "campaign" | "preflight" =
      body.mode === "test" ? "test" : body.mode === "preflight" ? "preflight" : "campaign";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const userId = userData.user.id;

    // Service-role client - api_configs is admin-RLS protected, so we read with service key
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const requestedOwnerId = typeof body.workspace_owner_id === "string" ? body.workspace_owner_id.trim() : "";
    let ownerUserId = userId;
    if (requestedOwnerId && requestedOwnerId !== userId) {
      const { data: member } = await admin
        .from("workspace_memberships")
        .select("user_id")
        .eq("workspace_owner_id", requestedOwnerId)
        .eq("user_id", userId)
        .maybeSingle();
      if (member) ownerUserId = requestedOwnerId;
    }

    // Load provider configs (global, shared across all users) using service role
    const { data: providerRows } = await admin
      .from("api_configs")
      .select("service_name, api_key, is_active");
    const providers = new Map<string, string>();
    for (const r of providerRows ?? []) {
      if (r.is_active && r.api_key) providers.set(r.service_name, r.api_key);
    }
    const sms019Raw = providers.get("019 SMS");
    const greenRaw = providers.get("Green API");
    const fromAddress = "Realtyz <updates@realtyz.co.il>"; // legacy display only

    const sms019Creds = sms019Raw ? sms019Raw.split(":") : null;
    const greenSharedRaw = greenRaw ? greenRaw.split(":") : null;
    const greenShared =
      greenSharedRaw && greenSharedRaw.length >= 2 && greenSharedRaw[0]
        ? { instance: greenSharedRaw[0], token: greenSharedRaw.slice(1).join(":") }
        : null;

    // Load ALL of the user's connected Gmail accounts (multi-account distribution)
    const { sessions: gmailSessions, reason: gmailReason } =
      await loadUserGmailSessions(admin, ownerUserId);
    const gmailSession = gmailSessions[0] ?? null; // backward compat / preflight summary
    const gmailReady = gmailSessions.length > 0;

    // Resend availability — used for >100 recipients or when explicitly requested
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendReady = resendApiKey.length > 0;
    const resendFromAddress =
      Deno.env.get("RESEND_FROM_ADDRESS") ?? "Realtyz <updates@realtyz.co.il>";

    // Load the user's connected Green API (with shared admin row as fallback)
    const { session: waSession, reason: waReason } =
      await loadUserWhatsAppSession(admin, ownerUserId, greenShared);
    const whatsappReady = !!waSession;

    // ========== PREFLIGHT: report which providers are configured ==========
    if (mode === "preflight") {
      let gmailUsedToday = 0;
      if (gmailSession) {
        gmailUsedToday = await gmailDailyUsedToday(admin, userId);
      }
      const totalGmailDailyCap = gmailSessions.reduce((s, g) => s + g.dailyLimit, 0);
      return new Response(
        JSON.stringify({
          providers: {
            sms: !!(sms019Creds && sms019Creds.length >= 2 && sms019Creds[0] && sms019Creds.slice(1).join(":")),
            whatsapp: whatsappReady,
            email: gmailReady || resendReady,
            voice: false,
          },
          emailProvider: gmailReady ? "gmail_user_oauth" : (resendReady ? "resend" : null),
          whatsappProvider: waSession?.source ?? null,
          whatsappAccount: waSession?.accountName ?? null,
          gmail: gmailSession
            ? {
                from: gmailSession.fromAddress,
                daily_limit: gmailSession.dailyLimit,
                used_today: gmailUsedToday,
                remaining: Math.max(0, gmailSession.dailyLimit - gmailUsedToday),
              }
            : null,
          gmail_accounts: gmailSessions.map((g) => ({
            from: g.fromAddress,
            daily_limit: g.dailyLimit,
          })),
          gmail_account_count: gmailSessions.length,
          gmail_total_daily_cap: totalGmailDailyCap,
          resend_ready: resendReady,
          bulk_resend_threshold: BULK_RESEND_THRESHOLD,
          gmail_reason: gmailReason,
          whatsapp_reason: waReason,
          fromAddress: gmailSession?.fromAddress ?? fromAddress,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // ========== TEST SEND ==========
    if (mode === "test") {
      const channel = String(body.channel ?? "sms");
      const recipient = String(body.recipient ?? "");
      const message = String(body.message ?? "Realtyz test send");
      const subject = String(body.subject ?? "Realtyz - בדיקת שיגור");
      // Personalize using sender's own profile if voter data not provided
      const ctx = {
        full_name: body?.preview_name ?? userData.user.user_metadata?.full_name ?? "",
        city: body?.preview_city ?? "",
        booth: body?.preview_booth ?? "",
      };
      const personalized = personalize(message, ctx);

      let result: SendResult;
      if (channel === "sms") {
        const local = toLocalIL(recipient);
        if (!local) result = { ok: false, failure_reason: "מספר טלפון לא תקין" };
        else if (!sms019Creds || sms019Creds.length < 2)
          result = { ok: false, failure_reason: "019 SMS לא מוגדר" };
        else
          result = await sendSms019(
            sms019Creds[0],
            sms019Creds.slice(1).join(":"),
            local,
            personalized,
            "Realtyz",
          );
      } else if (channel === "whatsapp") {
        const intl = toIntlIL(recipient);
        if (!intl) result = { ok: false, failure_reason: "מספר טלפון לא תקין" };
        else if (!waSession)
          result = {
            ok: false,
            failure_reason:
              "WhatsApp לא מחובר. יש להתחבר Green API בדף Social Connect לפני שליחת קמפיין",
          };
        else
          result = await sendWhatsAppGreen(
            waSession.instanceId,
            waSession.apiToken,
            intl,
            personalized,
            { supabaseUrl, serviceRoleKey: serviceKey, userId: ownerUserId },
          );
      } else if (channel === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
          result = { ok: false, failure_reason: "כתובת אימייל לא תקינה" };
        else if (gmailSession)
          result = await sendEmailUserGmail(admin, gmailSession, recipient, subject, personalized);
        else
          result = {
            ok: false,
            failure_reason:
              "חשבון Gmail לא מחובר. יש להתחבר בדף Social Connect לפני שליחת קמפיין",
          };
      } else {
        result = { ok: false, failure_reason: "Channel לא נתמך" };
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== REAL CAMPAIGN DISPATCH ==========
    const campaignName = String(body.campaign_name ?? "").trim();
    const limit = Math.min(Number(body.limit ?? 500), 1000);

    // ----- Safe-Sending controls (per request) -----
    // email_send_rate: 'burst' (no throttle) | 'safe' (default) | 'slow'
    // batch_size + delay range honored ONLY for email channel rows.
    const emailSendRate: "burst" | "safe" | "slow" =
      body.email_send_rate === "burst"
        ? "burst"
        : body.email_send_rate === "slow"
          ? "slow"
          : "safe";
    const SAFE_PROFILES = {
      burst: { batchSize: 50, minSec: 0, maxSec: 0 },
      safe: { batchSize: 20, minSec: 30, maxSec: 120 },
      slow: { batchSize: 10, minSec: 60, maxSec: 300 },
    } as const;
    const safe = SAFE_PROFILES[emailSendRate];
    // Caller can request Resend explicitly (used for >100 recipient blasts)
    const preferResend = body.prefer_resend === true && resendReady;

    if (!campaignName) {
      return new Response(
        JSON.stringify({ error: "campaign_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch queued rows for this user + campaign
    const { data: queued, error: queErr } = await admin
      .from("campaign_logs")
      .select("id, channel, lead_id, recipient_phone, recipient_email, recipient_name, message_body")
      .eq("user_id", ownerUserId)
      .eq("campaign_name", campaignName)
      .eq("status", "queued")
      .limit(limit);

    if (queErr) {
      return new Response(
        JSON.stringify({ error: queErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = queued ?? [];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, succeeded: 0, failed: 0, message: "אין שיגורים בתור" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch voter context (city, booth) in one batch so we can personalize.
    const voterIds = Array.from(new Set(rows.map((r: any) => r.lead_id).filter(Boolean)));
    const voterCtx = new Map<string, { city: string | null; booth: string | null; full_name: string | null }>();
    if (voterIds.length > 0) {
      const { data: voters } = await admin
        .from("leads")
        .select("id, full_name, city")
        .in("id", voterIds);
      for (const v of voters ?? []) {
        voterCtx.set(v.id, {
          full_name: v.full_name ?? null,
          city: v.city ?? null,
          booth: null,
        });
      }
    }

    let succeeded = 0;
    let failed = 0;

    // Multi-Gmail rotation: track per-account daily usage so we never exceed
    // each account's quota. Initialize from total already-sent today.
    const totalGmailUsedToday = gmailSessions.length > 0
      ? await gmailDailyUsedToday(admin, userId)
      : 0;
    // Distribute the historical "used today" evenly across accounts (best-effort
    // fairness; provider history isn't tracked per account). Each account can
    // still send up to its own dailyLimit.
    const perAccountUsed = new Map<string, number>();
    for (const g of gmailSessions) perAccountUsed.set(g.connectionId, 0);
    if (gmailSessions.length > 0 && totalGmailUsedToday > 0) {
      const evenly = Math.floor(totalGmailUsedToday / gmailSessions.length);
      for (const g of gmailSessions) perAccountUsed.set(g.connectionId, evenly);
    }
    // Round-robin pointer for Gmail account selection.
    let gmailRR = 0;
    function pickGmailAccount(): GmailSession | null {
      if (gmailSessions.length === 0) return null;
      for (let i = 0; i < gmailSessions.length; i += 1) {
        const idx = (gmailRR + i) % gmailSessions.length;
        const g = gmailSessions[idx];
        const used = perAccountUsed.get(g.connectionId) ?? 0;
        if (used < g.dailyLimit) {
          gmailRR = (idx + 1) % gmailSessions.length;
          return g;
        }
      }
      return null; // every account at quota
    }

    // Email-batch counter for drip jitter (only applies when channel === 'email')
    let emailBatchCounter = 0;

    for (const row of rows) {
      const channel = String(row.channel);
      const ctx = voterCtx.get(row.lead_id) ?? {
        full_name: row.recipient_name ?? null,
        city: null,
        booth: null,
      };
      const message = personalize(String(row.message_body ?? ""), ctx);
      const subject = `הודעה מ-${campaignName}`;
      let result: SendResult = { ok: false, failure_reason: "channel not handled" };
      let sourceAccount: string | null = null;

      if (channel === "sms") {
        const local = toLocalIL(row.recipient_phone);
        if (!local) result = { ok: false, failure_reason: "missing_phone" };
        else if (!sms019Creds || sms019Creds.length < 2)
          result = { ok: false, failure_reason: "provider_not_configured" };
        else
          result = await sendSms019(
            sms019Creds[0],
            sms019Creds.slice(1).join(":"),
            local,
            message,
            "Realtyz",
          );
      } else if (channel === "whatsapp") {
        const intl = toIntlIL(row.recipient_phone);
        if (!intl) result = { ok: false, failure_reason: "missing_phone" };
        else if (!waSession)
          result = {
            ok: false,
            failure_reason:
              "WhatsApp לא מחובר. יש להתחבר Green API בדף Social Connect לפני שליחת קמפיין",
          };
        else
          result = await sendWhatsAppGreen(
            waSession.instanceId,
            waSession.apiToken,
            intl,
            message,
            { supabaseUrl, serviceRoleKey: serviceKey, userId },
          );
      } else if (channel === "email") {
        const emailAddr = (row as any).recipient_email as string | null;
        if (!emailAddr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
          result = { ok: false, failure_reason: "missing_email" };
        } else {
          // Build the HTML body ONCE (with mandatory unsubscribe footer).
          const baseHtml = `<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">${escapeHtml(message).replace(/\n/g, "<br/>")}</div>`;
          const htmlWithFooter = appendUnsubscribeFooter(baseHtml, emailAddr, campaignName);

          // Decide route: Resend (bulk / explicit) vs Gmail (personal account).
          const useResend = preferResend && resendReady;

          if (useResend) {
            result = await sendEmailResend(
              resendApiKey,
              resendFromAddress,
              emailAddr,
              subject,
              htmlWithFooter,
            );
            sourceAccount = `Resend / ${resendFromAddress}`;
          } else {
            const gAccount = pickGmailAccount();
            if (!gAccount) {
              if (gmailSessions.length === 0) {
                result = {
                  ok: false,
                  failure_reason:
                    "חשבון Gmail לא מחובר. יש להתחבר בדף Social Connect לפני שליחת קמפיין",
                };
              } else {
                const totalCap = gmailSessions.reduce((s, g) => s + g.dailyLimit, 0);
                result = {
                  ok: false,
                  failure_reason: `הגעת למגבלת השליחה היומית של כל חשבונות ה-Gmail (${totalCap}). נסו שוב מחר או הפעילו Resend.`,
                };
              }
            } else {
              // sendEmailUserGmail re-wraps the body itself; pass the already-personalized
              // text plus an inline footer marker. We swap to a direct gmailSendOnce-style
              // call so the unsubscribe footer (HTML) is preserved exactly.
              const fullMessage = message + "\n\n---\nלהסרה מרשימת התפוצה: " + buildUnsubscribeLink(emailAddr, campaignName);
              result = await sendEmailUserGmail(admin, gAccount, emailAddr, subject, fullMessage);
              if (result.ok) {
                perAccountUsed.set(
                  gAccount.connectionId,
                  (perAccountUsed.get(gAccount.connectionId) ?? 0) + 1,
                );
              }
              sourceAccount = `Gmail / ${gAccount.fromAddress}`;
            }
          }

          // Drip jitter: after every `safe.batchSize` emails, sleep a random delay.
          emailBatchCounter += 1;
          if (
            (emailSendRate !== "burst") &&
            emailBatchCounter >= safe.batchSize &&
            safe.maxSec > 0
          ) {
            const delay = randomDelayMs(safe.minSec, safe.maxSec);
            console.log(`safe-send: sleeping ${delay}ms after batch of ${emailBatchCounter}`);
            await sleep(delay);
            emailBatchCounter = 0;
          }
        }
      } else if (channel === "voice") {
        result = { ok: false, failure_reason: "voice_coming_soon" };
      }

      // Source account labeling for non-email channels (email already set above).
      if (!sourceAccount) {
        if (channel === "sms") sourceAccount = sms019Creds?.[0] ? `019 / ${sms019Creds[0]}` : "019 SMS";
        else if (channel === "whatsapp") sourceAccount = waSession?.accountName ? `Green API / ${waSession.accountName}` : (waSession ? `Green API / ${waSession.instanceId}` : null);
      }

      const update = {
        status: result.ok ? "sent" : "failed",
        failure_reason: result.failure_reason ?? null,
        provider_message_id: result.provider_message_id ?? null,
        source_account: sourceAccount,
        sent_at: new Date().toISOString(),
      };

      const { error: updErr } = await admin
        .from("campaign_logs")
        .update(update)
        .eq("id", row.id);

      if (updErr) console.error("update log failed", row.id, updErr);

      // Touchpoint sync: write to messages so it appears instantly in the
      // Voter Profile timeline. Skip if no voter is linked or send failed.
      if (result.ok && row.lead_id) {
        const { error: msgErr } = await admin.from("messages").insert({
          lead_id: row.lead_id,
          direction: "outbound",
          sender_type: "campaign",
          channel,
          platform: channel === "whatsapp" ? "whatsapp" : channel,
          content: message,
          metadata: {
            kind: "campaign_touchpoint",
            campaign_name: campaignName,
            campaign_log_id: row.id,
            source_account: sourceAccount,
            provider_message_id: result.provider_message_id ?? null,
            status: "sent",
          },
        });
        if (msgErr) console.error("touchpoint insert failed", row.id, msgErr);
      }

      if (result.ok) succeeded += 1;
      else failed += 1;
    }

    return new Response(
      JSON.stringify({
        processed: rows.length,
        succeeded,
        failed,
        more: rows.length === limit,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("dispatch-campaign error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
