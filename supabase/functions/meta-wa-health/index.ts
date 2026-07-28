/**
 * meta-wa-health
 * ──────────────
 * Production readiness check for the official Meta WhatsApp Business Cloud API.
 *
 * Runs a set of live probes and returns a per-check status so the broker can
 * see, in Hebrew, whether the workspace is actually able to serve production
 * traffic:
 *   1. credentials   → WABA ID / Phone Number ID / access token stored
 *   2. token         → token valid, its scopes and expiry (via /debug_token)
 *   3. phone_number  → number verified + registered on the Cloud API
 *   4. webhook_sub   → the Meta app is subscribed to the WABA webhooks
 *   5. webhook_url   → our public webhook endpoint answers Meta's handshake
 *   6. messaging     → messaging limit / quality rating not restricted
 *
 * Read-only: it never mutates credentials.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const DEFAULT_API_VERSION = "v21.0";
const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"];

type CheckStatus = "ok" | "warn" | "fail" | "skip";

type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function graph(
  path: string,
  token: string,
  apiVersion: string,
): Promise<{ ok: boolean; status: number; data: any; error: any }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok && !data?.error, status: res.status, data, error: data?.error ?? null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: { message: e instanceof Error ? e.message : String(e) },
    };
  }
}

/** Hebrew explanation for the most common Graph failures. */
function hebrewGraphError(err: { code?: number; error_subcode?: number; message?: string } | null): string {
  const code = Number(err?.code ?? 0);
  const sub = Number(err?.error_subcode ?? 0);
  if (code === 190 && sub === 463) return "טוקן הגישה של Meta פג תוקף (ככל הנראה טוקן בדיקה זמני) — יש להנפיק טוקן קבוע.";
  if (code === 190) return "טוקן הגישה של Meta אינו תקף — יש להנפיק טוקן חדש ולחבר מחדש.";
  if (code === 200 || code === 10 || code === 3) {
    return "לטוקן חסרות הרשאות (whatsapp_business_messaging / whatsapp_business_management) על החשבון.";
  }
  if (code === 100 && sub === 33) return "מזהה המספר או ה-WABA לא נמצא — בדוק את Phone Number ID ו-WABA ID.";
  if (code === 100) return "פרמטר שגוי בבקשה ל-Meta — בדוק את מזהי החשבון והמספר.";
  return err?.message ? `Meta: ${err.message}` : "שגיאה לא ידועה מול Meta Graph API.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  try {
    // Settings are shared workspace-wide → always probe the owner's row.
    let ownerId = userId;
    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    const owner = ((prof as any)?.active_workspace_owner_id ??
      (prof as any)?.workspace_owner_id) as string | null;
    if (owner) ownerId = owner;

    const { data: row } = await admin
      .from("wa_providers")
      .select("id, config, is_active")
      .eq("user_id", ownerId)
      .eq("provider_name", "WBA")
      .maybeSingle();

    const cfg = ((row?.config as Record<string, unknown>) ?? {});
    const wabaId = String(cfg.waba_id ?? Deno.env.get("META_WABA_ID") ?? "").trim();
    const phoneNumberId = String(
      cfg.phone_number_id ?? Deno.env.get("META_WA_PHONE_NUMBER_ID") ??
        Deno.env.get("META_PHONE_NUMBER_ID") ?? "",
    ).trim();
    const accessToken = String(
      cfg.access_token ?? Deno.env.get("META_WA_ACCESS_TOKEN") ??
        Deno.env.get("META_WHATSAPP_TOKEN") ?? "",
    ).trim();
    const apiVersion = String(cfg.api_version ?? DEFAULT_API_VERSION);

    const checks: Check[] = [];

    // ── 1. Credentials present ───────────────────────────────────────
    const missing: string[] = [];
    if (!wabaId) missing.push("WABA ID");
    if (!phoneNumberId) missing.push("Phone Number ID");
    if (!accessToken) missing.push("Access Token");
    checks.push({
      id: "credentials",
      label: "פרטי התחברות",
      status: missing.length === 0 ? "ok" : "fail",
      message: missing.length === 0
        ? "כל פרטי החיבור ל-Meta שמורים בהגדרות סביבת העבודה."
        : `חסרים פרטים בהגדרות: ${missing.join(", ")}.`,
      details: {
        phone_number_id_last4: phoneNumberId.slice(-4) || null,
        waba_id_last4: wabaId.slice(-4) || null,
        api_version: apiVersion,
        is_active: row?.is_active ?? false,
      },
    });

    if (!accessToken || !phoneNumberId) {
      for (const [id, label] of [
        ["token", "תוקף והרשאות הטוקן"],
        ["phone_number", "סטטוס המספר"],
        ["webhook_sub", "מנוי Webhook ב-Meta"],
        ["messaging", "מכסת שליחה ואיכות"],
      ] as const) {
        checks.push({
          id,
          label,
          status: "skip",
          message: "לא נבדק — יש להשלים תחילה את פרטי החיבור.",
        });
      }
    } else {
      // ── 2. Token validity + scopes ─────────────────────────────────
      const dbg = await graph(
        `/debug_token?input_token=${encodeURIComponent(accessToken)}`,
        accessToken,
        apiVersion,
      );
      if (dbg.ok && dbg.data?.data) {
        const d = dbg.data.data;
        const scopes: string[] = Array.isArray(d.scopes) ? d.scopes : [];
        const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
        const expiresAt = Number(d.expires_at ?? 0);
        const neverExpires = !expiresAt;
        const expired = !d.is_valid || (!neverExpires && expiresAt * 1000 < Date.now());
        const expiresSoon = !neverExpires && !expired &&
          expiresAt * 1000 - Date.now() < 7 * 24 * 60 * 60 * 1000;
        let status: CheckStatus = "ok";
        let message = neverExpires
          ? "הטוקן תקף וללא תאריך תפוגה (טוקן קבוע) — מתאים לתעבורת ייצור."
          : "הטוקן תקף.";
        if (expired) {
          status = "fail";
          message = "הטוקן פג תוקף או בוטל — יש להנפיק טוקן קבוע (System User) ולחבר מחדש.";
        } else if (missingScopes.length > 0 && scopes.length > 0) {
          status = "fail";
          message = `חסרות הרשאות לטוקן: ${missingScopes.join(", ")} — יש להוסיף אותן באפליקציית Meta ולהנפיק טוקן חדש.`;
        } else if (expiresSoon) {
          status = "warn";
          message = `הטוקן יפוג בתאריך ${new Date(expiresAt * 1000).toLocaleDateString("he-IL")} — מומלץ להחליף לטוקן קבוע לפני עלייה לייצור.`;
        } else if (!neverExpires) {
          status = "warn";
          message = `הטוקן תקף עד ${new Date(expiresAt * 1000).toLocaleDateString("he-IL")} — טוקן זמני אינו מומלץ לייצור.`;
        }
        checks.push({
          id: "token",
          label: "תוקף והרשאות הטוקן",
          status,
          message,
          details: {
            scopes,
            missing_scopes: missingScopes,
            expires_at: neverExpires ? null : new Date(expiresAt * 1000).toISOString(),
            app_id: d.app_id ?? null,
            type: d.type ?? null,
          },
        });
      } else {
        // /debug_token needs app privileges on some token types — fall back to
        // a plain node read so we still know whether the token works at all.
        const probe = await graph(`/${phoneNumberId}?fields=id`, accessToken, apiVersion);
        checks.push({
          id: "token",
          label: "תוקף והרשאות הטוקן",
          status: probe.ok ? "warn" : "fail",
          message: probe.ok
            ? "הטוקן עובד מול Meta, אך לא ניתן לאמת את רשימת ההרשאות והתפוגה שלו (debug_token חסום עבור טוקן זה)."
            : hebrewGraphError(probe.error ?? dbg.error),
          details: { debug_token_error: dbg.error ?? null, probe_error: probe.error ?? null },
        });
      }

      // ── 3. Phone number verification / registration ────────────────
      const num = await graph(
        `/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,messaging_limit_tier,status`,
        accessToken,
        apiVersion,
      );
      if (num.ok) {
        const d = num.data ?? {};
        const verified = String(d.code_verification_status ?? "").toUpperCase() === "VERIFIED";
        const live = String(d.status ?? "").toUpperCase();
        const registered = live === "CONNECTED";
        let status: CheckStatus = "ok";
        let message = `המספר ${d.display_phone_number ?? ""} מאומת ומחובר ל-Cloud API ומוכן לתעבורת ייצור.`;
        if (!verified) {
          status = "fail";
          message = "המספר אינו מאומת מול Meta — יש להשלים את אימות הקוד בהגדרות.";
        } else if (!registered) {
          status = live ? "fail" : "warn";
          message = live
            ? `המספר מאומת אך אינו מחובר (${live}) — יש לרשום אותו מחדש עם קוד PIN.`
            : "המספר מאומת, אך Meta לא החזירה סטטוס חיבור — נסה לרענן.";
        }
        checks.push({
          id: "phone_number",
          label: "סטטוס המספר",
          status,
          message,
          details: {
            display_phone_number: d.display_phone_number ?? null,
            verified_name: d.verified_name ?? null,
            code_verification_status: d.code_verification_status ?? null,
            status: d.status ?? null,
            platform_type: d.platform_type ?? null,
          },
        });

        // ── 6. Messaging quota / quality ─────────────────────────────
        const quality = String(d.quality_rating ?? "").toUpperCase();
        const tier = String(d.messaging_limit_tier ?? "");
        checks.push({
          id: "messaging",
          label: "מכסת שליחה ואיכות",
          status: quality === "RED" ? "fail" : quality === "YELLOW" ? "warn" : "ok",
          message: quality === "RED"
            ? "דירוג האיכות של המספר אדום — Meta מגבילה את השליחה. יש לשפר את איכות ההודעות."
            : quality === "YELLOW"
            ? "דירוג האיכות של המספר צהוב — יש להיזהר מדיווחי ספאם."
            : `דירוג האיכות תקין${tier ? ` (מדרגת שליחה: ${tier})` : ""}.`,
          details: { quality_rating: d.quality_rating ?? null, messaging_limit_tier: tier || null },
        });
      } else {
        checks.push({
          id: "phone_number",
          label: "סטטוס המספר",
          status: "fail",
          message: hebrewGraphError(num.error),
          details: { error: num.error ?? null },
        });
        checks.push({
          id: "messaging",
          label: "מכסת שליחה ואיכות",
          status: "skip",
          message: "לא נבדק — קריאת פרטי המספר נכשלה.",
        });
      }

      // ── 4. Webhook subscription on the WABA ────────────────────────
      if (!wabaId) {
        checks.push({
          id: "webhook_sub",
          label: "מנוי Webhook ב-Meta",
          status: "warn",
          message: "לא ניתן לבדוק מנוי Webhook ללא WABA ID.",
        });
      } else {
        const subs = await graph(`/${wabaId}/subscribed_apps`, accessToken, apiVersion);
        const apps = Array.isArray(subs.data?.data) ? subs.data.data : [];
        checks.push({
          id: "webhook_sub",
          label: "מנוי Webhook ב-Meta",
          status: subs.ok ? (apps.length > 0 ? "ok" : "fail") : "fail",
          message: !subs.ok
            ? hebrewGraphError(subs.error)
            : apps.length > 0
            ? "אפליקציית Meta רשומה לקבלת Webhooks עבור חשבון הוואטסאפ העסקי."
            : "אף אפליקציה אינה רשומה ל-Webhooks של החשבון — הודעות נכנסות לא יתקבלו. יש לבצע הרשמה מחדש.",
          details: {
            subscribed_apps: apps.map((a: any) => a?.whatsapp_business_api_data?.name ?? a?.id ?? null),
          },
        });
      }
    }

    // ── 5. Public webhook endpoint handshake ─────────────────────────
    const verifyToken = Deno.env.get("WA_VERIFY_TOKEN") ?? Deno.env.get("VERIFY_TOKEN") ??
      Deno.env.get("META_WA_VERIFY_TOKEN") ?? Deno.env.get("MESSENGER_VERIFY_TOKEN") ?? "";
    const webhookUrl = `${supabaseUrl}/functions/v1/meta-wa-webhook`;
    if (!verifyToken) {
      checks.push({
        id: "webhook_url",
        label: "נקודת קצה Webhook",
        status: "fail",
        message: "לא הוגדר Verify Token עבור ה-Webhook — Meta לא תוכל לאמת את הכתובת.",
        details: { webhook_url: webhookUrl },
      });
    } else {
      const challenge = `hc${Date.now()}`;
      let handshakeOk = false;
      let handshakeInfo = "";
      try {
        const res = await fetch(
          `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`,
        );
        const text = (await res.text()).trim();
        handshakeOk = res.status === 200 && text === challenge;
        handshakeInfo = `status ${res.status}`;
      } catch (e) {
        handshakeInfo = e instanceof Error ? e.message : String(e);
      }
      checks.push({
        id: "webhook_url",
        label: "נקודת קצה Webhook",
        status: handshakeOk ? "ok" : "fail",
        message: handshakeOk
          ? "נקודת הקצה של ה-Webhook פעילה ומחזירה את אימות ההאנדשייק של Meta."
          : `נקודת הקצה של ה-Webhook לא עברה אימות (${handshakeInfo}) — יש לוודא שהכתובת וה-Verify Token זהים להגדרות ב-Meta.`,
        details: { webhook_url: webhookUrl },
      });
    }

    const failed = checks.filter((c) => c.status === "fail");
    const warned = checks.filter((c) => c.status === "warn");
    const overall: "ready" | "degraded" | "blocked" = failed.length > 0
      ? "blocked"
      : warned.length > 0
      ? "degraded"
      : "ready";
    const summary = overall === "ready"
      ? "החיבור ל-Meta WhatsApp מוכן לתעבורת ייצור."
      : overall === "degraded"
      ? "החיבור פעיל, אך יש נקודות שדורשות תשומת לב לפני ייצור."
      : "החיבור אינו מוכן לייצור — יש לטפל בכשלים המסומנים.";

    if (failed.length > 0) {
      await logIntegrationError({
        integration: "whatsapp",
        functionName: "meta-wa-health",
        errorCode: `health:${failed.map((c) => c.id).join(",")}`,
        errorMessage: `בדיקת מוכנות WhatsApp נכשלה: ${failed.map((c) => c.message).join(" | ")}`,
        context: { failed: failed.map((c) => ({ id: c.id, details: c.details })) },
      });
    }

    return json({
      success: true,
      overall,
      summary,
      checked_at: new Date().toISOString(),
      webhook_url: webhookUrl,
      checks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("meta-wa-health failed", message);
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "meta-wa-health",
      errorCode: "health:exception",
      errorMessage: message,
    });
    return json({ success: false, error: "בדיקת המוכנות נכשלה — נסה שוב.", details: message }, 500);
  }
});
