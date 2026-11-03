// GoLogin API token resolution and 403 diagnosis.
// The Super Admin-saved token (encrypted, service-only table) wins over the
// GOLOGIN_API_TOKEN environment secret.
import { decryptSession } from "./sessionCrypto.ts";

export const GOLOGIN_KEY = "gologin_api_token";
const ENC_KEY = () => Deno.env.get("FB_SESSION_ENC_KEY") ?? "";

export async function goLoginToken(admin: any): Promise<{ token: string; source: "admin" | "env" | null }> {
  const { data } = await admin.from("platform_service_credentials").select("value_encrypted").eq("key", GOLOGIN_KEY).maybeSingle();
  if (data?.value_encrypted && ENC_KEY()) {
    try { const t = (await decryptSession(data.value_encrypted, ENC_KEY())).trim(); if (t) return { token: t, source: "admin" }; } catch { /* fall back */ }
  }
  const env = (Deno.env.get("GOLOGIN_API_TOKEN") ?? "").trim();
  return { token: env, source: env ? "env" : null };
}

export type GoLoginCheck = { ok: boolean; status: "valid" | "invalid_token" | "plan_limit" | "unreachable"; message: string };

/** Checks the token itself (account endpoint) so a 403 elsewhere can be classified. */
export async function checkGoLoginToken(token: string): Promise<GoLoginCheck> {
  if (!token) return { ok: false, status: "invalid_token", message: "לא הוגדר מפתח GoLogin" };
  try {
    const r = await fetch("https://api.gologin.com/user", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401 || r.status === 403) return { ok: false, status: "invalid_token", message: "מפתח GoLogin שגוי או שפג תוקפו. יש ליצור מפתח חדש ב-GoLogin ולשמור אותו כאן." };
    if (!r.ok) return { ok: false, status: "unreachable", message: `שירות GoLogin החזיר שגיאה (${r.status}). נסו שוב מאוחר יותר.` };
    return { ok: true, status: "valid", message: "המפתח תקין" };
  } catch {
    return { ok: false, status: "unreachable", message: "לא ניתן להתחבר לשירות GoLogin כרגע." };
  }
}

/** Explains a 403 from profile creation / launch. */
export async function diagnoseGoLogin403(token: string, step: "profile" | "launch", body: string): Promise<GoLoginCheck> {
  const check = await checkGoLoginToken(token);
  if (check.status === "invalid_token") return check;
  const lower = body.toLowerCase();
  const quota = /limit|quota|plan|subscription|upgrade|maximum|exceed/.test(lower);
  return {
    ok: false, status: "plan_limit",
    message: step === "profile"
      ? (quota ? "המפתח תקין, אך חשבון GoLogin הגיע למכסת הפרופילים בתוכנית. יש לשדרג תוכנית או למחוק פרופילים ישנים." : "המפתח תקין, אך התוכנית ב-GoLogin אינה מאפשרת יצירת פרופילים דרך ה-API. יש לבדוק את התוכנית וההרשאות של המפתח.")
      : "המפתח תקין, אך התוכנית ב-GoLogin אינה כוללת הפעלת דפדפן בענן (Cloud Browser). יש לשדרג תוכנית.",
  };
}
