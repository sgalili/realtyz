// ext-metrics — the browser extension fetches which published group posts
// need a counter refresh, and reports scraped likes/comments/shares.
// Auth is the extension pairing token; the RPCs enforce workspace ownership.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const num = (v: unknown) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 10_000_000) : 0; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const token = String(body?.token ?? "").trim();
  if (!/^[a-f0-9]{32,80}$/i.test(token)) return json({ ok: false, reason: "invalid_token" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (body?.action === "targets") {
    const { data, error } = await admin.rpc("ext_metrics_targets", { _token: token, _limit: num(body?.limit) || 3 });
    if (error) { console.error("[ext-metrics] targets", error.message); return json({ ok: false, reason: "server_error" }, 500); }
    return json(data, (data as any)?.ok ? 200 : 401);
  }
  if (body?.action === "report") {
    const jobId = String(body?.job_id ?? "");
    if (!UUID_RE.test(jobId)) return json({ ok: false, reason: "invalid_job_id" }, 400);
    const { data, error } = await admin.rpc("ext_report_metrics", {
      _token: token, _job_id: jobId, _likes: num(body?.likes), _comments: num(body?.comments), _shares: num(body?.shares),
    });
    if (error) { console.error("[ext-metrics] report", error.message); return json({ ok: false, reason: "server_error" }, 500); }
    return json(data, (data as any)?.ok ? 200 : 401);
  }
  return json({ ok: false, reason: "invalid_action" }, 400);
});
