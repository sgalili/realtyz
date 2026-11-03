// cloud-social-inbox
// Messenger replies, group-post comments and lead capture through the saved
// cloud browser session (GoLogin-harvested cookies run by the cloud worker).
// No Meta Graph calls: business verification is pending.
//
//   POST { action: "tick" }  (x-worker-secret)        -> sync every active session, throttled
//   POST { workspace_owner_id } (user bearer token)    -> sync one workspace now
//   POST { action: "inbox_result" | "comments_result" | "send_result", ... } (x-worker-secret)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { decryptSession } from "../_shared/sessionCrypto.ts";
import { type InboundDm, persistInboundDm, resolveDmLead } from "../_shared/metaDm.ts";
import { runRitaForDm } from "../_shared/metaDmRita.ts";
import { privateReplyConfig } from "../_shared/metaPrivateReply.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";
const WORKER_URL = Deno.env.get("CLOUD_BROWSER_WORKER_URL") ?? "";
const WORKER_SECRET = Deno.env.get("CLOUD_WORKER_SHARED_SECRET") ?? "";
const SYNC_EVERY_MIN = 10;
const REPORT_URL = `${SUPABASE_URL}/functions/v1/cloud-social-inbox`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sessionFor(admin: any, ws: string) {
  const { data } = await admin.from("fb_cloud_sessions").select("cookies_encrypted, user_agent, status, expires_at").eq("workspace_owner_id", ws).maybeSingle();
  if (!data?.cookies_encrypted || data.status !== "active" || !ENC_KEY) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  try { return { session_cookies: await decryptSession(data.cookies_encrypted, ENC_KEY), user_agent: data.user_agent ?? null }; } catch { return null; }
}

async function dispatch(admin: any, ws: string, job: Record<string, unknown>) {
  if (!WORKER_URL || !WORKER_SECRET) return { ok: false, error: "cloud_worker_not_configured" };
  const session = await sessionFor(admin, ws);
  if (!session) return { ok: false, error: "missing_cloud_session" };
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": WORKER_SECRET },
    body: JSON.stringify({ job_id: crypto.randomUUID(), ...job, workspace_owner_id: ws, ...session, report_url: REPORT_URL }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => ({ ok: false, status: 0, e }));
  return res.ok ? { ok: true } : { ok: false, error: `worker_http_${(res as any).status}` };
}

/** Queue Messenger + comment scans for one workspace. */
async function syncWorkspace(admin: any, ws: string) {
  const inbox = await dispatch(admin, ws, { job_type: "inbox_sync", max_threads: 8 });
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: posts } = await admin.from("campaign_activity_queue")
    .select("id, runner_note").eq("workspace_owner_id", ws).eq("activity_type", "fb_group_post").eq("status", "completed")
    .gte("completed_at", since).like("runner_note", "https://%facebook.com/%").order("completed_at", { ascending: false }).limit(10);
  const list = (posts ?? []).map((p: any) => ({ job_id: p.id, post_url: p.runner_note }));
  const comments = list.length ? await dispatch(admin, ws, { job_type: "comments_sync", posts: list }) : { ok: true, skipped: true };
  await admin.from("cloud_poster_runs").insert({ workspace_owner_id: ws, processed: 1 + (list.length ? 1 : 0), dispatched: (inbox.ok ? 1 : 0) + ((comments as any).ok && list.length ? 1 : 0), failed: inbox.ok ? 0 : 1, note: inbox.ok ? "inbox_sync" : `inbox_sync:${(inbox as any).error}` });
  return { inbox, comments };
}

async function markSessionExpired(admin: any, ws: string, error: string) {
  await admin.from("fb_cloud_sessions").update({ status: "expired", last_error: error }).eq("workspace_owner_id", ws);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const fromWorker = !!WORKER_SECRET && req.headers.get("x-worker-secret") === WORKER_SECRET;
  const action = String(body?.action ?? "");
  const ws = String(body?.workspace_owner_id ?? "");

  /* ── worker callbacks ─────────────────────────────────────────────────── */
  if (["inbox_result", "comments_result", "send_result"].includes(action)) {
    if (!fromWorker) return json({ error: "unauthorized" }, 401);
    if (!ws) return json({ error: "missing_workspace" }, 400);
    if (body.status === "session_expired") { await markSessionExpired(admin, ws, String(body.error ?? "session_expired")); return json({ ok: true }); }

    if (action === "send_result") {
      if (body.message_id) {
        const { data: m } = await admin.from("messages").select("id, metadata, lead_id").eq("id", body.message_id).maybeSingle();
        if (m) await admin.from("messages").update({ metadata: { ...(m.metadata ?? {}), status: body.status === "completed" ? "sent" : "failed", error: body.status === "completed" ? null : String(body.error ?? "failed") } }).eq("id", m.id);
      }
      return json({ ok: true });
    }

    if (action === "inbox_result") {
      let stored = 0;
      for (const t of Array.isArray(body.threads) ? body.threads : []) {
        const threadId = String(t?.thread_id ?? "");
        if (!/^\d+$/.test(threadId)) continue;
        const msgs: any[] = Array.isArray(t?.messages) ? t.messages : [];
        const counts = new Map<string, number>();
        let lastInserted: InboundDm | null = null;
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          const text = String(m?.text ?? "").trim().slice(0, 4000);
          if (!text || m?.outbound) { if (m?.outbound) lastInserted = null; continue; }
          const key = await sha(text);
          const n = (counts.get(key) ?? 0) + 1; counts.set(key, n);
          const dm: InboundDm = { platform: "messenger", messageId: `fbweb:${threadId}:${key}:${n}`, senderId: `fbweb:${threadId}`, senderName: String(t?.name ?? "").trim() || null, text, createdAt: null, source: "facebook_messenger_cloud" };
          const res = await persistInboundDm(admin, ws, dm, "cloud-social-inbox");
          if (res === "inserted") { stored++; lastInserted = dm; } else lastInserted = null;
        }
        // Rita answers only when the newest message in the thread is a fresh inbound one.
        if (lastInserted) {
          const dm = lastInserted;
          await runRitaForDm(admin, ws, null, dm, async (reply) => {
            const r = await dispatch(admin, ws, { job_type: "messenger_send", thread_id: threadId, text: reply });
            return r.ok ? { ok: true, messageId: null } : { ok: false, error: String((r as any).error) };
          }, "cloud-social-inbox").catch((e) => console.error("[cloud-social-inbox] rita failed", e instanceof Error ? e.message : e));
        }
      }
      return json({ ok: true, stored });
    }

    // comments_result
    const cfg = await privateReplyConfig(admin, ws);
    let captured = 0;
    for (const p of Array.isArray(body.posts) ? body.posts : []) {
      const comments: any[] = Array.isArray(p?.comments) ? p.comments : [];
      const jobId = String(p?.job_id ?? "");
      if (jobId) {
        const { data: job } = await admin.from("campaign_activity_queue").select("id, comments_count").eq("id", jobId).eq("workspace_owner_id", ws).maybeSingle();
        if (job) await admin.from("campaign_activity_queue").update({ comments_count: Math.max(job.comments_count ?? 0, comments.length), last_synced_at: new Date().toISOString() }).eq("id", job.id);
      }
      for (const c of comments) {
        const commentId = String(c?.comment_id ?? "");
        const text = String(c?.text ?? "").trim();
        if (!/^\d+$/.test(commentId) || !text) continue;
        const { data: seen } = await admin.from("engagement_events").select("id").eq("user_id", ws).eq("external_id", commentId).maybeSingle();
        if (seen) continue;
        const author = String(c?.author_name ?? "").trim() || null;
        const authorKey = String(c?.author_id ?? author ?? commentId);
        const leadId = await resolveDmLead(admin, ws, { platform: "messenger", messageId: null, senderId: `fbweb-user:${authorKey}`, senderName: author, text, createdAt: null, source: "facebook_group_comment" });
        const { data: ev } = await admin.from("engagement_events").insert({ user_id: ws, platform: "facebook", sender_handle: author, inbound_text: text, status: "new", external_id: commentId, external_post_id: p?.post_url ?? null, lead_id: leadId, metadata: { source: "cloud-social-inbox", campaign_job_id: jobId || null } }).select("id").maybeSingle();
        if (leadId) {
          captured++;
          await admin.from("messages").insert({ lead_id: leadId, content: text, direction: "inbound", sender_type: "voter", channel: "messenger", platform: "facebook", metadata: { source: "facebook_group_comment", comment_id: commentId, post_url: p?.post_url ?? null } } as any);
        }
        if (cfg.enabled && ev?.id && p?.post_url) {
          const r = await dispatch(admin, ws, { job_type: "comment_reply", post_url: p.post_url, comment_id: commentId, text: cfg.text });
          await admin.from("engagement_events").update({ ai_reply_text: cfg.text, status: r.ok ? "replied" : "new", metadata: { source: "cloud-social-inbox", campaign_job_id: jobId || null, auto_reply: { ok: r.ok, at: new Date().toISOString(), error: (r as any).error ?? null } } }).eq("id", ev.id);
        }
      }
    }
    return json({ ok: true, captured });
  }

  /* ── scheduled tick ───────────────────────────────────────────────────── */
  if (action === "tick") {
    if (!fromWorker) return json({ error: "unauthorized" }, 401);
    const { data: sessions } = await admin.from("fb_cloud_sessions").select("workspace_owner_id").eq("status", "active");
    const cutoff = new Date(Date.now() - SYNC_EVERY_MIN * 60_000).toISOString();
    const out: any[] = [];
    for (const s of sessions ?? []) {
      const { data: recent } = await admin.from("cloud_poster_runs").select("id").eq("workspace_owner_id", s.workspace_owner_id).like("note", "inbox_sync%").gte("ran_at", cutoff).limit(1);
      if (recent?.length) continue;
      out.push({ ws: s.workspace_owner_id, ...(await syncWorkspace(admin, s.workspace_owner_id)) });
    }
    return json({ ok: true, synced: out.length });
  }

  /* ── user-triggered sync ──────────────────────────────────────────────── */
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: "unauthorized" }, 401);
  const target = ws || auth.user.id;
  if (target !== auth.user.id) {
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "super_admin");
    if (!roles?.length) return json({ error: "forbidden" }, 403);
  }
  const result = await syncWorkspace(admin, target);
  if (!result.inbox.ok && (result.inbox as any).error === "missing_cloud_session") return json({ error: "החיבור לפייסבוק אינו פעיל. יש להתחבר מחדש דרך חלון החיבור המאובטח." }, 409);
  return json({ ok: true, ...result });
});
