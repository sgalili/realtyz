import { z } from 'npm:zod@3';
import { adminClient } from '../_shared/authz.ts';
import { commitExternalEntity } from '../_shared/externalImportCommit.ts';
import { validExternalCounts, validWorkerCredential } from '../_shared/externalImportWorker.ts';

const scope = { worker_id: z.string().trim().min(1).max(100), job_id: z.string().uuid(), lease_token: z.string().uuid() };
const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('known'),...scope,kind:z.enum(['broker','developer']),url:z.string().url().max(500),license:z.string().regex(/^[1-9][0-9]{3,9}$/).optional()}).strict(),
  z.object({action:z.literal('broker'),...scope,url:z.string().url().max(500),html:z.string().max(8000000),more_html:z.array(z.string().max(8000000)).max(9).optional()}).strict(),
  z.object({action:z.literal('listing'),...scope,url:z.string().url().max(500),html:z.string().max(8000000),broker_id:z.string().uuid()}).strict(),
  z.object({action:z.literal('developer'),...scope,url:z.string().url().max(500),developer:z.record(z.unknown()),projects:z.array(z.record(z.unknown())).max(100),partial:z.boolean().optional(),units:z.number().int().min(0).max(100000).optional()}).strict(),
  z.object({ action: z.literal('claim'), worker_id: z.string().trim().min(1).max(100) }).strict(),
  z.object({
    action: z.literal('progress'), worker_id: z.string().trim().min(1).max(100),
    job_id: z.string().uuid(), lease_token: z.string().uuid(),
    checkpoint: z.record(z.unknown()).default({}),
    counts: z.record(z.number().int().min(0).max(2147483647)).refine(validExternalCounts).default({}),
    stage: z.string().min(1).max(100), status: z.enum(['running', 'paused', 'completed', 'failed']).default('running'),
    error: z.string().max(2000).nullable().default(null), release: z.boolean().default(false),
  }).strict(),
]);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Narrow machine-only credential: never accepts app JWTs or exposes the service key.
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!validWorkerCredential(Deno.env.get('IMPORT_WORKER_SHARED_SECRET') ?? '', req.headers.get('x-import-worker-secret') ?? '')) return json({ error: 'unauthorized' }, 401);
  const raw = await req.text();
  if (raw.length > 10_000_000) return json({ error: 'payload_too_large' }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_input' }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid_input' }, 400);
  const input = parsed.data;
  try {
    const admin = adminClient();
    if (input.action === 'claim') {
      const { data, error } = await admin.rpc('claim_external_import_job', { _worker: input.worker_id });
      if (error) throw error;
      return json({ ok: true, job: data?.[0] ?? null });
    }
    if (input.action !== 'progress') {
      const {data:job,error:readError}=await admin.from('broker_import_jobs').select('*').eq('id',input.job_id).single();
      if(readError || !job || job.checkpoint?.execution!=='external' || job.lease_token!==input.lease_token || job.checkpoint?.workerId!==input.worker_id || Date.parse(job.lease_until ?? '')<=Date.now()) return json({error:'stale_worker_lease'},409);
      if(job.status!=='running') return json({error:'job_not_running'},409);
      const {data:actor}=await admin.from('user_roles').select('user_id').eq('user_id',job.created_by).eq('role','super_admin').maybeSingle();
      const {data:demo}=await admin.from('demo_view_accounts').select('user_id').eq('user_id',job.created_by).maybeSingle();
      if(!actor || demo) return json({error:'forbidden'},403);
      return json(await commitExternalEntity(admin,job,input));
    }
    const { data, error } = await admin.rpc('report_external_import_job', {
      _id: input.job_id, _token: input.lease_token, _worker: input.worker_id,
      _checkpoint: input.checkpoint, _counts: input.counts, _stage: input.stage,
      _status: input.status, _error: input.error, _release: input.release,
    });
    if (error) throw error;
    return json(data);
  } catch (reason) {
    const error = reason as { message?: string; code?: string; status?: number };
    console.error('[external-import-worker]', JSON.stringify({ action: input.action, worker_id: input.worker_id, job_id: input.action !== 'claim' ? input.job_id : undefined, code: error.code, error: error.message }));
    return json({ error: error.message ?? 'worker_request_failed' }, error.status && error.status >=400 ? error.status : error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === 'P0001' ? 422 : 500);
  }
});