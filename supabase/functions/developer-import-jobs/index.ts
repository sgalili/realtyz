import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { adminClient, canAccessWorkspace, enforceRequestScope, requireCaller } from '../_shared/authz.ts';
import { cachedScrapingText, trackScraping } from '../_shared/scrapingAudit.ts';
import { DEVELOPER_CACHE_SECONDS } from '../_shared/scrapingPolicy.ts';
import { ProviderRateLimitError, retryAfterMs } from '../_shared/brightDataThrottle.ts';
import { rotatingUnlockerPayload } from '../_shared/brightDataRotation.ts';
import { developerImportUrl, developerProjectImportRow, readPage } from '../_shared/yad2DeveloperImport.ts';
import { developerRetryDelay, MAX_PAGE_ATTEMPTS, mergeProjectPage, projectPageRows, safeImportError } from './queue.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function startImport(req: Request, body: Record<string, unknown>) {
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user') return json({ error: 'unauthorized' }, 401);
  const scoped = await enforceRequestScope(req, caller);
  if (scoped) return scoped;
  const workspace = typeof body.workspace_owner_id === 'string' && UUID.test(body.workspace_owner_id) ? body.workspace_owner_id : '';
  const sourceUrl = developerImportUrl(typeof body.url === 'string' ? body.url : '');
  if (!workspace || !sourceUrl) return json({ error: 'invalid_url', message: 'הדביקו קישור תקין לעמוד היזם ביד2' }, 400);
  const admin = adminClient();
  if (!await canAccessWorkspace(caller.userId, workspace, admin)) return json({ error: 'forbidden', message: 'אין הרשאה לסביבת העבודה' }, 403);
  const { data: roles, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', workspace).eq('role', 'developer').limit(1);
  if (roleError || !roles?.length) return json({ error: 'forbidden', message: 'הייבוא זמין בחשבון יזם' }, 403);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: subscription, error: subscriptionError } = await client.rpc('get_developer_subscription_status');
  if (subscriptionError) return json({ error: 'subscription_status_unavailable', message: 'לא ניתן לאמת את מנוי היזם כרגע' }, 503);
  if (!(subscription as { active?: boolean; workspace_owner_id?: string } | null)?.active || subscription.workspace_owner_id !== workspace) {
    return json({ error: 'developer_subscription_required', message: 'ייבוא פרויקטים זמין לאחר אישור תשלום מנוי היזמים' }, 402);
  }
  const { data: existing, error: existingError } = await admin.from('developer_import_jobs').select('id,status,lease_until').eq('workspace_owner_id', workspace).eq('source_url', sourceUrl).eq('status', 'running').maybeSingle();
  if (existingError) return json({ error: 'queue_unavailable', message: 'לא ניתן לפתוח את תור הייבוא' }, 503);
  if (existing) {
    if (!existing.lease_until || new Date(existing.lease_until).getTime() <= Date.now()) {
      await admin.from('developer_import_jobs').update({ lease_token: null, lease_until: null, next_attempt_at: new Date().toISOString() }).eq('id', existing.id).eq('status', 'running');
    }
    return json({ ok: true, job_id: existing.id, resumed: true }, 202);
  }
  const lease = crypto.randomUUID();
  const { data: job, error: jobError } = await admin.from('developer_import_jobs').insert({ workspace_owner_id: workspace, requested_by: caller.userId, source_url: sourceUrl, lease_token: lease, lease_until: new Date(Date.now() + 60_000).toISOString() }).select('id').single();
  if (jobError || !job) return json({ error: 'queue_unavailable', message: 'לא ניתן לפתוח את תור הייבוא' }, 503);
  const { error: pageError } = await admin.from('developer_import_pages').insert({ job_id: job.id, url: sourceUrl, kind: 'profile' });
  if (pageError) {
    await admin.from('developer_import_jobs').update({ status: 'failed', error: 'profile_queue_failed', lease_token: null, lease_until: null }).eq('id', job.id);
    return json({ error: 'queue_unavailable', message: 'לא ניתן לפתוח את עמוד היזם בתור' }, 503);
  }
  await admin.from('developer_import_jobs').update({ lease_token: null, lease_until: null, next_attempt_at: new Date().toISOString() }).eq('id', job.id);
  return json({ ok: true, job_id: job.id }, 202);
}

async function fetchDeveloperPage(url: string, attempt: number) {
  const token = Deno.env.get('BRIGHTDATA_API_TOKEN');
  const zone = Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'web_unlocker4';
  if (!token) throw new Error('not_configured');
  const html = await cachedScrapingText('developer_import', url, DEVELOPER_CACHE_SECONDS, async () => {
    const result = await trackScraping('developer_import', 'rest', url, async () => {
      const response = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rotatingUnlockerPayload(zone, url, attempt)),
        signal: AbortSignal.timeout(40_000),
      });
      return { status: response.status, html: await response.text(), retryAfterMs: retryAfterMs(response.headers.get('retry-after')) };
    }, value => ({ status: value.status, bytes: new TextEncoder().encode(value.html).length }));
    if (result.status === 429) throw new ProviderRateLimitError(result.retryAfterMs);
    if (result.status >= 400) throw new Error(`provider_${result.status}`);
    if (!result.html.trim()) throw new Error('empty_response');
    if (/captcha|access denied|verify you are human/i.test(result.html) && !/__NEXT_DATA__|projectName/.test(result.html)) throw new Error('source_blocked');
    return result.html;
  });
  return readPage(html, url);
}

async function ensureDeveloper(job: any, page: any) {
  const admin = adminClient();
  let developerId = job.developer_id as string | null;
  const { data: existing, error } = developerId
    ? await admin.from('developers').select('*').eq('id', developerId).eq('workspace_owner_id', job.workspace_owner_id).maybeSingle()
    : await admin.from('developers').select('*').eq('workspace_owner_id', job.workspace_owner_id).eq('source_url', job.source_url).maybeSingle();
  if (error) throw error;
  const source = page.developer ?? {};
  const row = {
    workspace_owner_id: job.workspace_owner_id,
    owner_user_id: existing?.owner_user_id ?? job.requested_by,
    company_name: source.company_name || existing?.company_name || 'החברה שלי',
    phone: source.phone ?? existing?.phone ?? null,
    logo_url: source.logo_url ?? existing?.logo_url ?? null,
    source_url: job.source_url,
    last_synced_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { error: updateError } = await admin.from('developers').update(row).eq('id', existing.id);
    if (updateError) throw updateError;
    developerId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await admin.from('developers').insert(row).select('id').single();
    if (insertError || !inserted) throw insertError ?? new Error('developer_save_failed');
    developerId = inserted.id;
  }
  if (source.bio) {
    const { error: bioError } = await admin.from('profiles').update({ imported_public_bio: source.bio }).eq('id', job.workspace_owner_id).is('imported_public_bio', null);
    if (bioError) throw bioError;
  }
  return developerId!;
}

async function saveProjects(job: any, developerId: string, projects: any[]) {
  if (!projects.length) return;
  const admin = adminClient();
  const { data: existing, error } = await admin.from('developer_projects').select('*').eq('developer_id', developerId).eq('workspace_owner_id', job.workspace_owner_id);
  if (error) throw error;
  const rows = projects.map(project => {
    const old = (existing ?? []).find(row => row.source_project_id === String(project.source_project_id ?? project.source_url ?? project.name) || !!project.source_url && row.source_url === project.source_url);
    return developerProjectImportRow(old, project, developerId, job.workspace_owner_id);
  });
  const { error: saveError } = await admin.from('developer_projects').upsert(rows, { onConflict: 'developer_id,source_project_id' });
  if (saveError) throw saveError;
}

async function finalizeIfDone(jobId: string) {
  const admin = adminClient();
  const { data: pages, error } = await admin.from('developer_import_pages').select('kind,status,attempts,next_attempt_at').eq('job_id', jobId);
  if (error) throw error;
  const active = (pages ?? []).find(page => page.status === 'running' || (page.status === 'pending' && page.attempts < MAX_PAGE_ATTEMPTS));
  if (active) return { done: false, waiting: active.next_attempt_at ? new Date(active.next_attempt_at).getTime() > Date.now() : false };
  const profileFailed = (pages ?? []).some(page => page.kind === 'profile' && page.status === 'failed');
  const failedProjects = (pages ?? []).filter(page => page.kind === 'project' && page.status === 'failed').length;
  const completedProjects = (pages ?? []).filter(page => page.kind === 'project' && page.status === 'completed').length;
  const { data: job } = await admin.from('developer_import_jobs').select('developer_id').eq('id', jobId).single();
  if (job?.developer_id) {
    const { data: saved } = await admin.from('developer_projects').select('name,total_units').eq('developer_id', job.developer_id).order('created_at', { ascending: true }).limit(1);
    await admin.from('developers').update({ first_project_name: saved?.[0]?.name ?? null, first_project_units: saved?.[0]?.total_units ?? null, last_synced_at: new Date().toISOString() }).eq('id', job.developer_id);
  }
  await admin.from('developer_import_jobs').update({
    status: profileFailed ? 'failed' : 'completed', stage: 'completed', completed_at: new Date().toISOString(), lease_token: null, lease_until: null,
    error: profileFailed ? 'לא ניתן לקרוא את עמוד היזם לאחר מספר ניסיונות' : failedProjects ? `${failedProjects} עמודי פרויקט נכשלו; ${completedProjects} פרויקטים נשמרו` : null,
  }).eq('id', jobId);
  return { done: true, failed_projects: failedProjects, completed_projects: completedProjects };
}

async function stepImport(body: Record<string, unknown>) {
  const jobId = typeof body.job_id === 'string' && UUID.test(body.job_id) ? body.job_id : '';
  if (!jobId) return json({ error: 'invalid_job' }, 400);
  const admin = adminClient();
  const { data: claimed, error: claimError } = await admin.rpc('claim_developer_import_page', { _job: jobId });
  if (claimError) return json({ error: 'claim_failed', message: claimError.message }, 500);
  const page = claimed?.[0] as any;
  if (!page) {
    const result = await finalizeIfDone(jobId);
    return json({ ok: true, ...result });
  }
  const { data: job, error: jobError } = await admin.from('developer_import_jobs').select('*').eq('id', jobId).single();
  if (jobError || !job || job.lease_token !== page.lease_token) return json({ error: 'lease_lost' }, 409);
  const release = async (patch: Record<string, unknown>) => {
    await admin.from('developer_import_jobs').update({ lease_token: null, lease_until: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...patch }).eq('id', jobId).eq('lease_token', page.lease_token);
  };
  try {
    const parsed = page.fetch_required ? await fetchDeveloperPage(page.url, page.attempts) : { developer: {}, projects: page.payload?.projects ?? [], links: [] };
    if (page.kind === 'profile') {
      const developerId = await ensureDeveloper(job, parsed);
      const rows = projectPageRows(job.source_url, parsed.projects ?? [], parsed.links ?? []);
      if (rows.length) {
        const { error: pagesError } = await admin.from('developer_import_pages').upsert(rows.map(row => ({ ...row, job_id: jobId })), { onConflict: 'job_id,url', ignoreDuplicates: true });
        if (pagesError) throw pagesError;
      }
      await admin.from('developer_import_pages').update({ status: 'completed', payload: { developer: parsed.developer ?? {}, projects: parsed.projects ?? [], links: parsed.links ?? [] }, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', page.id).eq('lease_token', page.lease_token);
      await release({ stage: 'projects', developer_id: developerId, company: parsed.developer ?? {}, error: null });
      return json({ ok: true, stage: 'profile', project_pages: rows.length });
    }
    const projects = mergeProjectPage(page.payload?.projects ?? [], parsed.projects ?? []);
    if (!projects.length) throw new Error('project_not_found');
    await saveProjects(job, job.developer_id, projects);
    await admin.from('developer_import_pages').update({ status: 'completed', payload: { projects }, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', page.id).eq('lease_token', page.lease_token);
    await release({ error: null });
    return json({ ok: true, stage: 'project', projects: projects.length });
  } catch (error) {
    const rateLimited = error instanceof ProviderRateLimitError;
    const permanent = page.attempts >= MAX_PAGE_ATTEMPTS || safeImportError(error) === 'not_configured';
    const delay = developerRetryDelay(page.attempts, error instanceof ProviderRateLimitError ? error.retryAfterMs : 0, rateLimited);
    const next = new Date(Date.now() + (permanent ? 0 : delay)).toISOString();
    const message = safeImportError(error);
    await admin.from('developer_import_pages').update({ status: permanent ? 'failed' : 'pending', error: message, next_attempt_at: next, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', page.id).eq('lease_token', page.lease_token);
    await admin.from('developer_import_jobs').update({ lease_token: null, lease_until: null, next_attempt_at: next, error: permanent ? message : 'ניסיון חוזר אוטומטי', updated_at: new Date().toISOString() }).eq('id', jobId).eq('lease_token', page.lease_token);
    return json({ ok: true, retrying: !permanent, retry_in_ms: permanent ? 0 : delay });
  }
}

/** Browser continuation shares the leased worker, never a service credential. */
async function continueImport(req: Request, body: Record<string, unknown>) {
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user') return json({ error: 'unauthorized' }, 401);
  const scoped = await enforceRequestScope(req, caller);
  if (scoped) return scoped;
  const jobId = typeof body.job_id === 'string' && UUID.test(body.job_id) ? body.job_id : '';
  const workspace = typeof body.workspace_owner_id === 'string' && UUID.test(body.workspace_owner_id) ? body.workspace_owner_id : '';
  if (!jobId || !workspace) return json({ error: 'invalid_job' }, 400);
  const admin = adminClient();
  if (!await canAccessWorkspace(caller.userId, workspace, admin)) return json({ error: 'forbidden' }, 403);
  const { data: job, error } = await admin.from('developer_import_jobs').select('status,lease_until,next_attempt_at').eq('id', jobId).eq('workspace_owner_id', workspace).maybeSingle();
  if (error || !job) return json({ error: 'job_unavailable' }, 404);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: subscription, error: subscriptionError } = await client.rpc('get_developer_subscription_status');
  if (subscriptionError || !subscription?.active || subscription.workspace_owner_id !== workspace) return json({ error: 'developer_subscription_required' }, 402);
  if (job.status !== 'running') return json({ ok: true, done: true });
  const eligibleAt = Math.max(Date.parse(job.lease_until ?? '') || 0, Date.parse(job.next_attempt_at ?? '') || 0);
  if (eligibleAt > Date.now()) return json({ ok: true, retry_in_ms: Math.min(2_000, eligibleAt - Date.now()) });
  return stepImport({ job_id: jobId });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: Record<string, unknown>;
  try { const parsed = await req.json(); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid'); body = parsed; } catch { return json({ error: 'invalid_request' }, 400); }
  if (body.action === 'start') return startImport(req, body);
  if (body.action === 'continue') return continueImport(req, body);
  if (body.action === 'step') {
    const caller = await requireCaller(req, ['service', 'cron']);
    if (caller instanceof Response) return caller;
    return stepImport(body);
  }
  return json({ error: 'invalid_action' }, 400);
});
