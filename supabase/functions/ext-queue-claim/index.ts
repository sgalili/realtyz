// ext-queue-claim
// The browser extension polls this every 60s with its workspace sync key and
// receives the Facebook group posts that are due right now. Claiming is atomic
// (pending -> processing with a 10 minute hold) and expired holds are released,
// so a job can never stay stuck "in progress".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { publishedPostText } from '../_shared/promotionalFooter.ts';
import { anonymousSocialText, socialPrivacyIdentities } from '../_shared/socialIdentityPrivacy.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (!/^[a-f0-9]{32,80}$/i.test(token)) {
    return json({ ok: false, reason: "invalid_token" }, 400);
  }
  const limitRaw = Number(body?.limit ?? 2);
  const limit = Number.isFinite(limitRaw) ? Math.min(5, Math.max(1, Math.trunc(limitRaw))) : 2;
  const userAgent = typeof body?.user_agent === "string" ? body.user_agent.slice(0, 300) : null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc("ext_claim_jobs", {
    _token: token,
    _limit: limit,
    _user_agent: userAgent,
  });

  if (error) {
    console.error("[ext-queue-claim] rpc failed", error.message);
    return json({ ok: false, reason: "server_error" }, 500);
  }
  if (!(data as any)?.ok) {
    return json({ ok: false, reason: (data as any)?.reason ?? "invalid_token" }, 401);
  }

  const workspace = (data as any).workspace_owner_id;
  try {
    const jobs = await Promise.all(((data as any).jobs ?? []).map(async (job: any) => {
      const { data: row, error: rowError } = await admin.from('campaign_activity_queue').select('payload,listing_id').eq('id', job.id).eq('workspace_owner_id', workspace).maybeSingle();
      if (rowError || !row) throw new Error('Unauthorized publication');
      const identities = await socialPrivacyIdentities(admin, workspace, row.payload?.listing_id ?? row.listing_id);
      const body = anonymousSocialText(job.message, identities);
      const link = typeof job.link === 'string' ? job.link.trim() : '';
      const text = await publishedPostText(admin, workspace, `group:${job.id}`, link && !body.includes(link) ? `${body}\n\n${link}` : body);
      return { ...job, message: text };
    }));
    return json({ ok: true, workspace_owner_id: workspace, jobs });
  } catch {
    return json({ ok: false, reason: 'publication_footer_unavailable' }, 503);
  }
});
