// fb-session-vault
// Stores / inspects / clears the workspace owner's encrypted Facebook session
// cookies so the cloud worker can publish to groups while the laptop is off.
//
// Login takes place only in Facebook's interface inside GoLogin. No client
// password or manual session-cookie uploads are supported.
//
// The raw cookie payload is encrypted with AES-GCM (FB_SESSION_ENC_KEY) before
// it touches the database and is NEVER returned to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encryptSession, decryptSession } from "../_shared/sessionCrypto.ts";
import { acceptsFacebookConnectionRequest } from "../_shared/facebookConnectionPrivacy.ts";

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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!acceptsFacebookConnectionRequest(body)) {
    return json({ error: "credentials_not_accepted", message: "ההתחברות מתבצעת רק בפייסבוק בדפדפן הענן. אין לשלוח פרטי התחברות ל-TORAFF." }, 400);
  }
  const action = String(body?.action ?? "status");

  // ── Cloud runner callback: group-fetch results (worker secret, no user JWT).
  if (action === "fetch_result") {
    const workerSecret = Deno.env.get("CLOUD_WORKER_SHARED_SECRET") ?? "";
    if (!workerSecret || req.headers.get("x-worker-secret") !== workerSecret) {
      return json({ error: "unauthorized" }, 401);
    }
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return json({ error: "missing_job_id" }, 400);
    const ok = body?.status === "completed";
    const { data: fetchJob } = await admin.from("fb_group_fetch_jobs").select("workspace_owner_id,query,status").eq("id", jobId).maybeSingle();
    if (!fetchJob || fetchJob.status !== "processing") return json({ success: true, ignored: true });
    if (ok && fetchJob.query === "__members__") {
      const groups = Array.isArray(body?.groups) ? body.groups : [];
      for (const group of groups.slice(0, 300)) {
        const id = String(group?.group_id ?? "");
        const name = String(group?.group_name ?? "").trim().slice(0, 200);
        if (!/^[A-Za-z0-9._-]+$/.test(id) || !name || group?.is_member !== true) continue;
        const groupId = `fb:${id}`;
        const { data: existing } = await admin.from("fb_user_groups").select("id,is_blocked").eq("workspace_owner_id", fetchJob.workspace_owner_id).eq("group_id", groupId).maybeSingle();
        if (existing?.is_blocked) continue;
        const values = { group_name: name, group_url: `https://www.facebook.com/groups/${id}`, join_status: "joined", cloud_join_state: "joined", cloud_checked_at: new Date().toISOString() };
        const { error } = existing
          ? await admin.from("fb_user_groups").update(values).eq("id", existing.id).eq("workspace_owner_id", fetchJob.workspace_owner_id)
          : await admin.from("fb_user_groups").insert({ ...values, workspace_owner_id: fetchJob.workspace_owner_id, group_id: groupId, source: "cloud", is_selected: true });
        if (error) {
          if (/group_limit_reached/.test(error.message)) break;
          await admin.from("fb_group_fetch_jobs").update({ status: "failed", error: "שמירת הקבוצות נכשלה", claim_expires_at: null }).eq("id", jobId);
          return json({ error: "sync_failed" }, 500);
        }
      }
    }
    const { error: updateError } = await admin.from("fb_group_fetch_jobs").update({
      status: ok ? "completed" : "failed",
      groups: ok && Array.isArray(body?.groups) ? body.groups.slice(0, 500) : null,
      error: ok ? null : String(body?.error ?? "סריקת הקבוצות בענן נכשלה").slice(0, 1000),
      claim_expires_at: null,
    }).eq("id", jobId).eq("status", "processing");
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ success: true });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const { data: userRes, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userRes?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  // Cloud-first: every action is scoped to the caller's active workspace
  // (resolved and authorized server-side), so any member with workspace
  // access manages the workspace's Facebook cloud connection — not just the
  // super admin, and never a personal one.
  const scoped = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: owner, error: ownerError } = await scoped.rpc("current_workspace_owner");
  if (ownerError || !owner) return json({ error: "workspace_unavailable" }, 403);
  const { data: allowed, error: accessError } = await scoped.rpc("ws_current_access", { _ws: owner });
  if (accessError || !allowed) return json({ error: "workspace_forbidden" }, 403);

  if (action === "monitor") {
    const { data: role, error: roleError } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
    if (roleError) return json({ error: "role_check_failed" }, 500);
    if (!role) return json({ error: "forbidden" }, 403);

    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const base = () => admin.from("campaign_activity_queue").select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", owner).eq("runner", "cloud").eq("activity_type", "fb_group_post");
    const workerUrl = Deno.env.get("CLOUD_BROWSER_WORKER_URL") ?? "";
    const probe = async () => {
      if (!workerUrl) return false;
      try {
        const response = await fetch(new URL("/health", workerUrl), { signal: AbortSignal.timeout(8000), redirect: "error" });
        if (!response.ok) return false;
        const text = (await response.text()).trim();
        // Current deployed runner uses this exact health response, not generic HTML.
        return text === "realtyz cloud runner ok";
      } catch { return false; }
    };
    const [reachable, heartbeat, tick, pending, processing, sent, failed, overdue, expired] = await Promise.all([
      probe(),
      admin.from("cloud_poster_runs").select("ran_at").is("workspace_owner_id", null)
        .like("note", "railway_heartbeat:%").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("cloud_poster_runs").select("ran_at").is("workspace_owner_id", null)
        .eq("note", "tick").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      base().eq("status", "pending"), base().eq("status", "processing"),
      base().eq("status", "completed").gte("completed_at", dayStart.toISOString()),
      base().eq("status", "failed").gte("processed_at", dayStart.toISOString()),
      base().eq("status", "pending").lt("scheduled_for", new Date(now.getTime() - 15 * 60_000).toISOString()),
      base().eq("status", "processing").lt("claim_expires_at", now.toISOString()),
    ]);
    if ([heartbeat, tick, pending, processing, sent, failed, overdue, expired].some((result) => result.error)) {
      return json({ error: "monitor_read_failed" }, 500);
    }
    let publicWorkerUrl: string | null = null;
    try { const url = new URL(workerUrl); if (url.protocol === "https:") publicWorkerUrl = url.origin; } catch { /* unset */ }
    return json({
      checked_at: now.toISOString(),
      worker: { url: publicWorkerUrl, configured: !!workerUrl, reachable, last_heartbeat: heartbeat.data?.ran_at ?? null },
      scheduler: { last_tick: tick.data?.ran_at ?? null },
      queue: { pending: pending.count ?? 0, processing: processing.count ?? 0, sent_today: sent.count ?? 0,
        failed_today: failed.count ?? 0, overdue: overdue.count ?? 0, expired_leases: expired.count ?? 0 },
    });
  }

  if (action === "status") {
    const { data } = await admin
      .from("fb_cloud_sessions")
      .select("status, last_verified_at, expires_at, user_agent, updated_at, last_error")
      .eq("workspace_owner_id", owner)
      .maybeSingle();
    let ready = false;
    const workerUrl = Deno.env.get('CLOUD_BROWSER_WORKER_URL');
    if (workerUrl) { try { const response = await fetch(new URL('/health', workerUrl), { signal: AbortSignal.timeout(5000), redirect: 'error' }); ready = response.ok && (await response.text()).trim() === 'realtyz cloud runner ok'; } catch { /* unavailable */ } }
    return json({ success: true, session: data ?? null, worker_ready: ready });
  }

  if (action === "summary") {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const base = () => admin.from("campaign_activity_queue").select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", owner).eq("runner", "cloud").eq("activity_type", "fb_group_post");
    const [sent, pending, failed, pool] = await Promise.all([
      base().eq("status", "completed").gte("completed_at", dayStart.toISOString()),
      base().in("status", ["pending", "processing"]),
      base().eq("status", "failed").gte("processed_at", dayStart.toISOString()),
      admin.from("fb_user_groups").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", owner).eq("pool_status", "active").eq("is_blocked", false),
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
        .eq("workspace_owner_id", owner).order("ran_at", { ascending: false }).limit(10),
    ]);
    return json({ success: true, last_tick: last?.ran_at ?? null, runs: mine ?? [] });
  }

  if (action === "remote_login") {
    const token = Deno.env.get("GOLOGIN_API_TOKEN") ?? "";
    if (!token) return json({ error: "not_configured", message: "שירות הדפדפן בענן עדיין לא הוגדר. פנו למנהל המערכת" }, 400);
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const { data: row } = await admin.from("fb_cloud_sessions")
      .select("remote_profile_id").eq("workspace_owner_id", owner).maybeSingle();
    let profileId = row?.remote_profile_id as string | undefined;
    const createProfile = async () => {
      const r = await fetch("https://api.gologin.com/browser/quick", {
        method: "POST", headers: h, body: JSON.stringify({ os: "lin", name: `realtyz-${String(owner).slice(0, 8)}` }),
      });
      if (!r.ok) throw new Error(`profile_${r.status}`);
      const id = (await r.json())?.id;
      if (!id) throw new Error("profile_missing");
      return id as string;
    };
    const launch = (id: string) => fetch(`https://api.gologin.com/browser/${id}/web`, { method: "POST", headers: h });
    try {
      if (!profileId) profileId = await createProfile();
      let w = await launch(profileId);
      // A stored profile may be stale (deleted / from another GoLogin account): recreate once.
      if ((w.status === 403 || w.status === 404) && row?.remote_profile_id) {
        profileId = await createProfile();
        w = await launch(profileId);
      }
      if (!w.ok) {
        console.error("gologin web launch failed", w.status);
        if (w.status === 401 || w.status === 403) {
          return json({
            error: "remote_forbidden",
            message: "חשבון הדפדפן בענן אינו מאפשר פתיחת דפדפן מרוחק (נדרש מפתח תקף ומנוי הכולל Cloud Browser)",
          }, 200);
        }
        throw new Error(`web_${w.status}`);
      }
      const url = (await w.json())?.remoteOrbitaUrl;
      if (!url || !String(url).startsWith("https://")) throw new Error("no_url");
      await admin.from("fb_cloud_sessions").upsert({
        workspace_owner_id: owner, remote_profile_id: profileId, status: "connecting", last_error: null,
      }, { onConflict: "workspace_owner_id" });
      return json({ success: true, url });
    } catch (e) {
      console.error("gologin remote_login error", (e as Error).message);
      return json({ error: "remote_failed", message: `פתיחת הדפדפן בענן נכשלה (${(e as Error).message})` }, 200);
    }
  }

  // Poll the cloud browser profile: once Facebook login cookies exist there,
  // encrypt and activate the workspace session (no Meta OAuth involved).
  if (action === "remote_check") {
    const token = Deno.env.get("GOLOGIN_API_TOKEN") ?? "";
    if (!token || !ENC_KEY) return json({ success: true, active: false });
    const { data: row } = await admin.from("fb_cloud_sessions")
      .select("remote_profile_id,status").eq("workspace_owner_id", owner).maybeSingle();
    if (row?.status === "active") return json({ success: true, active: true });
    const profileId = row?.remote_profile_id as string | undefined;
    if (!profileId) return json({ success: true, active: false });
    try {
      const r = await fetch(`https://api.gologin.com/browser/${profileId}/cookies`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return json({ success: true, active: false });
      const all = await r.json();
      const fb = (Array.isArray(all) ? all : []).filter((c: any) => /(^|\.)facebook\.com$/i.test(String(c?.domain ?? "")) && ["c_user", "xs", "datr", "sb", "fr", "presence", "wd"].includes(c?.name));
      const has = (n: string) => fb.some((c: any) => c?.name === n && c?.value);
      if (!has("c_user") || !has("xs")) return json({ success: true, active: false });
      const cookies_encrypted = await encryptSession(JSON.stringify(fb), ENC_KEY);
      const { error } = await admin.from("fb_cloud_sessions").update({
        cookies_encrypted, status: "active", last_verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 25 * 86400_000).toISOString(), last_error: null,
      }).eq("workspace_owner_id", owner);
      if (error) return json({ error: "save_failed", message: "שמירת החיבור נכשלה" }, 500);
      return json({ success: true, active: true });
    } catch {
      return json({ success: true, active: false });
    }
  }

  if (action === "clear") {
    const { error } = await admin.from("fb_cloud_sessions").delete().eq("workspace_owner_id", owner);
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
        workspace_owner_id: owner,
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
      .eq("workspace_owner_id", owner)
      .maybeSingle();
    return json({ success: true, session: saved ?? { status: "active", expires_at, last_error: null } });
  }

  /* ── Cloud-first group discovery ─────────────────────────────────────── */

  if (action === "fetch_groups" || action === "sync_groups") {
    const syncMemberships = action === "sync_groups";
    const query = syncMemberships ? "__members__" : String(body?.query ?? "").trim().slice(0, 120);
    if (query.length < 2) return json({ error: "invalid_query", message: "יש להזין מילת חיפוש" }, 400);

    const { data: session } = await admin.from("fb_cloud_sessions")
      .select("cookies_encrypted, user_agent, status, expires_at")
      .eq("workspace_owner_id", owner).maybeSingle();
    const expired = session?.expires_at ? new Date(session.expires_at).getTime() < Date.now() : false;
    if (!session?.cookies_encrypted || session.status !== "active" || expired) {
      return json({ error: "no_cloud_session", message: "אין חיבור פייסבוק פעיל בענן – חברו את פייסבוק תחילה" }, 400);
    }
    const workerUrl = Deno.env.get("CLOUD_BROWSER_WORKER_URL") ?? "";
    if (!workerUrl || !ENC_KEY) {
      return json({ error: "cloud_worker_not_configured", message: "שירות הדפדפן בענן עדיין לא הוגדר" }, 400);
    }

    let cookies: string;
    try { cookies = await decryptSession(session.cookies_encrypted, ENC_KEY); }
    catch { return json({ error: "decrypt_failed", message: "שחזור החיבור נכשל – שמרו חיבור חדש" }, 500); }

    const { data: job, error: insertError } = await admin.from("fb_group_fetch_jobs").insert({
      workspace_owner_id: owner, requested_by: user.id, query, status: "processing", claimed_at: new Date().toISOString(), claim_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }).select("id").single();
    if (insertError || !job) return json({ error: "enqueue_failed" }, 500);

    try {
      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": Deno.env.get("CLOUD_WORKER_SHARED_SECRET") ?? "" },
        body: JSON.stringify({
          job_type: "group_fetch", job_id: job.id, query, sync_memberships: syncMemberships,
          session_cookies: cookies, user_agent: session.user_agent ?? null,
          report_url: `${SUPABASE_URL}/functions/v1/fb-session-vault`,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`worker_http_${res.status}`);
    } catch (e) {
      await admin.from("fb_group_fetch_jobs").update({
        status: "failed", error: `שגיאת ענן: ${String((e as Error).message)}`,
      }).eq("id", job.id);
      return json({ error: "dispatch_failed", message: "סריקת הקבוצות בענן נכשלה, נסו שוב" }, 502);
    }
    return json({ success: true, job_id: job.id });
  }

  if (action === "fetch_status") {
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return json({ error: "missing_job_id" }, 400);
    const { data: job } = await admin.from("fb_group_fetch_jobs")
      .select("id, status, groups, error, created_at, claim_expires_at")
      .eq("id", jobId).eq("workspace_owner_id", owner).maybeSingle();
    if (!job) return json({ error: "not_found" }, 404);
    // Expired lease: the cloud runner crashed or timed out mid-scan.
    if (job.status === "processing" && job.claim_expires_at && new Date(job.claim_expires_at).getTime() < Date.now()) {
      const timeoutError = "הסריקה בענן ארכה יותר מדי – נסו שוב";
      await admin.from("fb_group_fetch_jobs").update({
        status: "failed", error: timeoutError,
      }).eq("id", job.id).eq("status", "processing");
      job.status = "failed"; job.error = timeoutError;
    }
    return json({ success: true, job });
  }

  return json({ error: "unknown_action" }, 400);
});
