// cloud-group-poster
// Cloud publishing worker bridge for Facebook group posts. Runs on a cron tick,
// claims due queue rows whose runner is 'cloud', and hands each job to a
// headless-browser worker (CLOUD_BROWSER_WORKER_URL) together with the
// decrypted Facebook session cookies. The user's laptop can be off.
//
// Modes:
//   POST {}                              -> dispatch tick (cron / owner triggered)
//   POST { action: "report", ... }        -> worker callback with the result
//        headers: x-worker-secret: CLOUD_WORKER_SHARED_SECRET
//        body: { job_id, status: "completed" | "failed", error?, post_url? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { decryptSession } from "../_shared/sessionCrypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";
const WORKER_URL = Deno.env.get("CLOUD_BROWSER_WORKER_URL") ?? "";
const WORKER_SECRET = Deno.env.get("CLOUD_WORKER_SHARED_SECRET") ?? "";

const BATCH = 5;
const LEASE_MIN = 10;
const MAX_ATTEMPTS = 3;

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

  /* ── worker callback ─────────────────────────────────────────────────── */
  if (body?.action === "report") {
    if (!WORKER_SECRET || req.headers.get("x-worker-secret") !== WORKER_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return json({ error: "missing_job_id" }, 400);
    const ok = body?.status === "completed";
    const { error } = await admin
      .from("campaign_activity_queue")
      .update({
        status: ok ? "completed" : "failed",
        completed_at: ok ? new Date().toISOString() : null,
        processed_at: new Date().toISOString(),
        last_error: ok ? null : String(body?.error ?? "פרסום בענן נכשל"),
        runner_note: typeof body?.post_url === "string" ? body.post_url : null,
        claimed_by: null,
        claim_expires_at: null,
      })
      .eq("id", jobId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  /* ── dispatch tick ───────────────────────────────────────────────────── */
  const now = new Date();
  const nowIso = now.toISOString();

  // Release expired leases so a crashed worker never strands a job.
  await admin
    .from("campaign_activity_queue")
    .update({ status: "pending", claimed_by: null, claim_expires_at: null, last_error: "cloud_lease_expired" })
    .eq("runner", "cloud")
    .eq("status", "processing")
    .lt("claim_expires_at", nowIso);

  const { data: due, error } = await admin
    .from("campaign_activity_queue")
    .select("*")
    .eq("runner", "cloud")
    .eq("activity_type", "fb_group_post")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);

  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  const sessionCache = new Map<string, { cookies: string; user_agent: string | null } | null>();

  async function sessionFor(ws: string) {
    if (sessionCache.has(ws)) return sessionCache.get(ws)!;
    const { data } = await admin
      .from("fb_cloud_sessions")
      .select("cookies_encrypted, user_agent, status, expires_at")
      .eq("workspace_owner_id", ws)
      .maybeSingle();
    let out: { cookies: string; user_agent: string | null } | null = null;
    if (data?.cookies_encrypted && data.status === "active" && ENC_KEY) {
      const expired = data.expires_at ? new Date(data.expires_at).getTime() < Date.now() : false;
      if (!expired) {
        try {
          out = { cookies: await decryptSession(data.cookies_encrypted, ENC_KEY), user_agent: data.user_agent ?? null };
        } catch { out = null; }
      }
    }
    sessionCache.set(ws, out);
    return out;
  }

  for (const row of due ?? []) {
    const ws = row.workspace_owner_id as string;

    if (!WORKER_URL) {
      await admin
        .from("campaign_activity_queue")
        .update({ last_error: "cloud_worker_not_configured", scheduled_for: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
      results.push({ id: row.id, status: "deferred", reason: "cloud_worker_not_configured" });
      continue;
    }

    const session = await sessionFor(ws);
    if (!session) {
      await admin
        .from("campaign_activity_queue")
        .update({
          status: "failed",
          last_error: "אין חיבור פייסבוק שמור לענן – התחברו מחדש בהגדרות הפרסום",
          processed_at: nowIso,
        })
        .eq("id", row.id)
        .eq("status", "pending");
      results.push({ id: row.id, status: "failed", reason: "missing_cloud_session" });
      continue;
    }

    // Atomic claim: only one worker tick may take the row.
    const { data: claimed } = await admin
      .from("campaign_activity_queue")
      .update({
        status: "processing",
        claim_expires_at: new Date(Date.now() + LEASE_MIN * 60_000).toISOString(),
        processed_at: nowIso,
        cloud_attempts: (row.cloud_attempts ?? 0) + 1,
        last_error: null,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) { results.push({ id: row.id, status: "skipped", reason: "claimed_elsewhere" }); continue; }

    const payload = row.payload ?? {};
    const jobBody = {
      job_id: row.id,
      workspace_owner_id: ws,
      group_url: payload.group_url ?? payload.groupUrl ?? row.target_ref ?? null,
      group_name: row.target_label ?? payload.group_name ?? null,
      text: payload.body ?? payload.text ?? "",
      images: Array.isArray(payload.images) ? payload.images : [],
      first_comment: payload.first_comment ?? payload.firstComment ?? null,
      session_cookies: session.cookies,
      user_agent: session.user_agent,
      report_url: `${SUPABASE_URL}/functions/v1/cloud-group-poster`,
    };

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": WORKER_SECRET },
        body: JSON.stringify(jobBody),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`worker_http_${res.status}`);
      results.push({ id: row.id, status: "dispatched" });
    } catch (e) {
      const attempts = (row.cloud_attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await admin
        .from("campaign_activity_queue")
        .update({
          status: giveUp ? "failed" : "pending",
          claimed_by: null,
          claim_expires_at: null,
          scheduled_for: giveUp ? row.scheduled_for : new Date(Date.now() + 15 * 60_000).toISOString(),
          last_error: giveUp
            ? `הפרסום בענן נכשל אחרי ${attempts} ניסיונות: ${String((e as Error).message)}`
            : `שגיאת ענן זמנית: ${String((e as Error).message)}`,
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: giveUp ? "failed" : "retry", error: String((e as Error).message) });
    }
  }

  return json({ success: true, processed: results.length, results });
});
