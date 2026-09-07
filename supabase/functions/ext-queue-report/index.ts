// ext-queue-report
// The extension reports the outcome of a Facebook group post it executed
// locally. Success marks the queue row completed and logs it for stats;
// failure records a clear Hebrew reason and either retries or fails the row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  const token = String(body?.token ?? "").trim();
  const jobId = String(body?.job_id ?? "").trim();
  if (!/^[a-f0-9]{32,80}$/i.test(token)) return json({ ok: false, reason: "invalid_token" }, 400);
  if (!UUID_RE.test(jobId)) return json({ ok: false, reason: "invalid_job_id" }, 400);

  const ok = body?.ok === true;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 400) : null;
  const postUrl = typeof body?.post_url === "string" ? body.post_url.slice(0, 500) : null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc("ext_report_job", {
    _token: token,
    _job_id: jobId,
    _ok: ok,
    _reason: reason,
    _post_url: postUrl,
  });

  if (error) {
    console.error("[ext-queue-report] rpc failed", error.message);
    return json({ ok: false, reason: "server_error" }, 500);
  }
  if (!(data as any)?.ok) {
    return json({ ok: false, reason: (data as any)?.reason ?? "invalid_token" }, 401);
  }

  return json({ ok: true, status: (data as any).status });
});
