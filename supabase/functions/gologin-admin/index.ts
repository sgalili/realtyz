// gologin-admin — Super Admin-only GoLogin token management.
//   { action: "status" }          -> { configured, source, last_check_* }
//   { action: "save", token }     -> validates, encrypts and stores the token
//   { action: "test" }            -> rechecks the active token
// The token value is never returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encryptSession } from "../_shared/sessionCrypto.ts";
import { checkGoLoginToken, ensureToraffProfile, GOLOGIN_KEY, goLoginToken } from "../_shared/gologin.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: auth } = await admin.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!auth?.user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "super_admin");
  if (!roles?.length) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action ?? "status");

  const record = async (status: string, message: string) => {
    await admin.from("platform_service_credentials").update({ last_check_status: status, last_check_message: message, last_checked_at: new Date().toISOString() }).eq("key", GOLOGIN_KEY);
  };

  if (action === "save") {
    const token = String(body?.token ?? "").trim();
    if (token.length < 20 || /\s/.test(token)) return json({ error: "invalid", message: "המפתח שהוזן אינו תקין" }, 400);
    const enc = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";
    if (!enc) return json({ error: "not_configured", message: "מפתח ההצפנה של המערכת חסר" }, 500);
    const check = await checkGoLoginToken(token);
    if (check.status === "invalid_token") return json({ error: "invalid_token", message: check.message }, 400);
    const { error } = await admin.from("platform_service_credentials").upsert({
      key: GOLOGIN_KEY, value_encrypted: await encryptSession(token, enc), updated_by: auth.user.id, updated_at: new Date().toISOString(),
      last_check_status: check.status, last_check_message: check.message, last_checked_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) return json({ error: "save_failed", message: "שמירת המפתח נכשלה" }, 500);
    return json({ ok: true, check });
  }

  const { token, source } = await goLoginToken(admin);
  if (action === "migrate_profiles") {
    if (!token) return json({ error: "not_configured", message: "לא הוגדר מפתח GoLogin" }, 400);
    const { data: rows } = await admin.from("fb_cloud_sessions").select("workspace_owner_id, remote_profile_id").not("remote_profile_id", "is", null);
    let updated = 0, missing = 0, failed = 0;
    for (const r of rows ?? []) {
      try {
        const res = await ensureToraffProfile(token, r.remote_profile_id, r.workspace_owner_id);
        if (res === "ok") updated++;
        else { missing++; await admin.from("fb_cloud_sessions").update({ remote_profile_id: null }).eq("workspace_owner_id", r.workspace_owner_id); }
      } catch (e) { failed++; console.error("gologin migrate failed", (e as Error).message); }
    }
    return json({ ok: failed === 0, total: rows?.length ?? 0, updated, missing, failed });
  }

  if (action === "test") {
    const check = await checkGoLoginToken(token);
    if (source === "admin") await record(check.status, check.message);
    return json({ ok: check.ok, source, check });
  }

  const { data: row } = await admin.from("platform_service_credentials").select("last_check_status,last_check_message,last_checked_at,updated_at").eq("key", GOLOGIN_KEY).maybeSingle();
  return json({ configured: !!token, source, ...(row ?? {}) });
});
