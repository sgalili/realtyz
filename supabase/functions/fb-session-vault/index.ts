// fb-session-vault
// Stores / inspects / clears the workspace owner's encrypted Facebook session
// cookies so the cloud worker can publish to groups while the laptop is off.
//
// Actions (POST JSON): { action: "status" | "save" | "clear" }
//   save  -> { cookies: string | object[], user_agent?: string, expires_at?: string }
//
// The raw cookie payload is encrypted with AES-GCM (FB_SESSION_ENC_KEY) before
// it touches the database and is NEVER returned to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encryptSession } from "../_shared/sessionCrypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userRes, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userRes?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action ?? "status");

  if (action === "status") {
    const { data } = await admin
      .from("fb_cloud_sessions")
      .select("status, last_verified_at, expires_at, user_agent, updated_at, last_error")
      .eq("workspace_owner_id", user.id)
      .maybeSingle();
    return json({ success: true, session: data ?? null, worker_ready: !!Deno.env.get("CLOUD_BROWSER_WORKER_URL") });
  }

  if (action === "summary") {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const base = () => admin.from("campaign_activity_queue").select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", user.id).eq("runner", "cloud").eq("activity_type", "fb_group_post");
    const [sent, pending, failed, pool] = await Promise.all([
      base().eq("status", "completed").gte("completed_at", dayStart.toISOString()),
      base().in("status", ["pending", "processing"]),
      base().eq("status", "failed").gte("processed_at", dayStart.toISOString()),
      admin.from("fb_user_groups").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", user.id).eq("pool_status", "active").eq("is_blocked", false),
    ]);
    return json({ success: true, summary: {
      sent_today: sent.count ?? 0, pending: pending.count ?? 0,
      failed_today: failed.count ?? 0, active_pool: pool.count ?? 0, pool_cap: 100,
    } });
  }

  if (action === "runs") {
    const [{ data: last }, { data: mine }] = await Promise.all([
      admin.from("cloud_poster_runs").select("ran_at").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("cloud_poster_runs").select("ran_at, processed, dispatched, deferred, failed, note")
        .eq("workspace_owner_id", user.id).order("ran_at", { ascending: false }).limit(10),
    ]);
    return json({ success: true, last_tick: last?.ran_at ?? null, runs: mine ?? [] });
  }

  if (action === "remote_login") {
    const token = Deno.env.get("GOLOGIN_API_TOKEN") ?? "";
    if (!token) return json({ error: "not_configured", message: "שירות הדפדפן בענן עדיין לא הוגדר. פנו למנהל המערכת" }, 400);
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const { data: row } = await admin.from("fb_cloud_sessions")
      .select("remote_profile_id").eq("workspace_owner_id", user.id).maybeSingle();
    let profileId = row?.remote_profile_id as string | undefined;
    try {
      if (!profileId) {
        const r = await fetch("https://api.gologin.com/browser/quick", {
          method: "POST", headers: h, body: JSON.stringify({ os: "lin", name: `realtyz-${user.id.slice(0, 8)}` }),
        });
        if (!r.ok) throw new Error(`profile_${r.status}`);
        profileId = (await r.json())?.id;
        if (!profileId) throw new Error("profile_missing");
      }
      const w = await fetch(`https://api.gologin.com/browser/${profileId}/web`, { method: "POST", headers: h });
      if (!w.ok) throw new Error(`web_${w.status}`);
      const url = (await w.json())?.remoteOrbitaUrl;
      if (!url || !String(url).startsWith("https://")) throw new Error("no_url");
      await admin.from("fb_cloud_sessions").upsert({
        workspace_owner_id: user.id, remote_profile_id: profileId, status: "connecting", last_error: null,
      }, { onConflict: "workspace_owner_id" });
      return json({ success: true, url });
    } catch (e) {
      return json({ error: "remote_failed", message: `פתיחת הדפדפן בענן נכשלה (${(e as Error).message})` }, 502);
    }
  }

  if (action === "clear") {
    const { error } = await admin.from("fb_cloud_sessions").delete().eq("workspace_owner_id", user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, session: null });
  }

  if (action === "save") {
    if (!ENC_KEY) return json({ error: "missing_encryption_key" }, 500);
    const raw = body?.cookies;
    const serialized = typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? null);
    if (!serialized || serialized === "null" || serialized.length < 20) {
      return json({ error: "invalid_cookies", message: "לא נמצאו נתוני התחברות תקינים" }, 400);
    }
    if (serialized.length > 200_000) {
      return json({ error: "cookies_too_large", message: "נתוני ההתחברות גדולים מדי" }, 400);
    }

    // Must contain Facebook's login cookies, in any common export format
    // (JSON array from an extension, or a "name=value; ..." header string).
    const hasCookie = (n: string) => new RegExp(`(["']?name["']?\\s*:\\s*["']${n}["'])|(\\b${n}=)`).test(serialized);
    if (!hasCookie("c_user") || !hasCookie("xs")) {
      return json({ error: "missing_login_cookies", message: "חסרים נתוני ההתחברות של פייסבוק (c_user ו-xs). ודאו שהעתקתם מדפדפן מחובר" }, 400);
    }

    let cookies_encrypted: string;
    try {
      cookies_encrypted = await encryptSession(serialized, ENC_KEY);
    } catch {
      return json({ error: "encryption_failed", message: "ההצפנה נכשלה, נסו שוב" }, 500);
    }

    const expires_at = typeof body?.expires_at === "string" && body.expires_at
      ? body.expires_at
      : new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from("fb_cloud_sessions").upsert(
      {
        workspace_owner_id: user.id,
        cookies_encrypted,
        user_agent: typeof body?.user_agent === "string" ? body.user_agent.slice(0, 512) : null,
        status: "active",
        last_verified_at: new Date().toISOString(),
        expires_at,
        last_error: null,
      },
      { onConflict: "workspace_owner_id" },
    );
    if (error) return json({ error: error.message }, 500);

    const { data: saved } = await admin
      .from("fb_cloud_sessions")
      .select("status, last_verified_at, expires_at, user_agent, updated_at, last_error")
      .eq("workspace_owner_id", user.id)
      .maybeSingle();
    return json({ success: true, session: saved ?? { status: "active", expires_at, last_error: null } });
  }

  return json({ error: "unknown_action" }, 400);
});
