// railway-worker-gateway
// Pull-based API for the external Railway publishing worker. The worker never
// receives database credentials; it authenticates with RAILWAY_WORKER_KEY
// (header `x-worker-key` or `Authorization: Bearer <key>`).
//
// Actions (POST JSON { action, ... }):
//   heartbeat                         -> liveness ping (logged to cloud_poster_runs)
//   claim_batch { worker_id?, limit? } -> atomically leases due cloud group-post jobs
//                                        and returns them with decrypted session cookies
//   report_result { job_id, status: "completed"|"failed", post_url?, error? }
//
// Rejection blocking, cooldown and pool rebalance stay server-owned: failed /
// completed status updates fire the existing queue triggers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { decryptSession } from "../_shared/sessionCrypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";
const WORKER_KEY = Deno.env.get("RAILWAY_WORKER_KEY") ?? "";

const LEASE_MIN = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("heartbeat"), worker_id: z.string().max(100).optional() }),
  z.object({
    action: z.literal("claim_batch"),
    worker_id: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  z.object({
    action: z.literal("report_result"),
    job_id: z.string().uuid(),
    status: z.enum(["completed", "failed"]),
    post_url: z.string().url().max(1000).optional(),
    error: z.string().max(1000).optional(),
  }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const provided =
    req.headers.get("x-worker-key") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!WORKER_KEY || !safeEqual(provided, WORKER_KEY)) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const body = parsed.data;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  if (body.action === "heartbeat") {
    await admin.from("cloud_poster_runs").insert({
      workspace_owner_id: null, processed: 0, note: `railway_heartbeat:${body.worker_id ?? "worker"}`,
    });
    return json({ success: true, server_time: nowIso });
  }

  if (body.action === "report_result") {
    const ok = body.status === "completed";
    const { data, error } = await admin
      .from("campaign_activity_queue")
      .update({
        status: ok ? "completed" : "failed",
        completed_at: ok ? nowIso : null,
        processed_at: nowIso,
        last_error: ok ? null : (body.error ?? "פרסום בענן נכשל"),
        runner_note: body.post_url ?? null,
        claimed_by: null,
        claim_expires_at: null,
      })
      .eq("id", body.job_id)
      .eq("runner", "cloud")
      .eq("status", "processing") // idempotent: only the leased job can be reported once
      .select("id")
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, updated: !!data });
  }

  // claim_batch
  const limit = body.limit ?? 5;

  await admin
    .from("campaign_activity_queue")
    .update({ status: "pending", claimed_by: null, claim_expires_at: null, last_error: "cloud_lease_expired" })
    .eq("runner", "cloud").eq("status", "processing").lt("claim_expires_at", nowIso);

  const { data: due, error } = await admin
    .from("campaign_activity_queue")
    .select("*")
    .eq("runner", "cloud").eq("activity_type", "fb_group_post").eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  const sessions = new Map<string, { cookies: string; user_agent: string | null } | null>();
  async function sessionFor(ws: string) {
    if (sessions.has(ws)) return sessions.get(ws) ?? null;
    const { data } = await admin
      .from("fb_cloud_sessions")
      .select("cookies_encrypted, user_agent, status, expires_at")
      .eq("workspace_owner_id", ws).maybeSingle();
    let out: { cookies: string; user_agent: string | null } | null = null;
    const expired = data?.expires_at ? new Date(data.expires_at).getTime() < Date.now() : false;
    if (data?.cookies_encrypted && data.status === "active" && ENC_KEY && !expired) {
      try {
        const cookies = await decryptSession(data.cookies_encrypted, ENC_KEY);
        if (/c_user=/.test(cookies) && /xs=/.test(cookies)) out = { cookies, user_agent: data.user_agent ?? null };
      } catch { out = null; }
    }
    sessions.set(ws, out);
    return out;
  }

  const jobs: any[] = [];
  for (let row of due ?? []) {
    const ws = row.workspace_owner_id as string;
    const session = await sessionFor(ws);
    if (!session) {
      await admin.from("campaign_activity_queue")
        .update({ status: "failed", processed_at: nowIso, last_error: "אין חיבור פייסבוק שמור לענן – התחברו מחדש בהגדרות הפרסום" })
        .eq("id", row.id).eq("status", "pending");
      continue;
    }
    const { data: ready, error: preflightError } = await admin.rpc('fb_prepare_cloud_group_post', { _job: row.id });
    if (preflightError || !ready) continue;
    const { data: prepared } = await admin.from('campaign_activity_queue').select('*').eq('id', row.id).eq('status', 'processing').maybeSingle();
    if (!prepared) continue;
    row = prepared;

    const p = row.payload ?? {};
    jobs.push({
      job_id: row.id,
      workspace_owner_id: ws,
      group_url: p.group_url ?? p.groupUrl ?? row.target_ref ?? null,
      group_name: row.target_label ?? p.group_name ?? null,
      text: p.body ?? p.text ?? "",
      images: Array.isArray(p.images) ? p.images : [],
      first_comment: p.first_comment ?? p.firstComment ?? null,
      session_cookies: session.cookies,
      user_agent: session.user_agent,
      lease_expires_at: new Date(Date.now() + LEASE_MIN * 60_000).toISOString(),
    });
  }

  return json({ success: true, jobs });
});
