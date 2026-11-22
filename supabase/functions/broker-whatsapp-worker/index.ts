import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin, requireCaller } from '../_shared/authz.ts';
import { validWorkerCredential } from '../_shared/externalImportWorker.ts';
import { brokerWhatsAppRetry, discoverBrokerWhatsApp } from '../_shared/brokerWhatsApp.ts';

const scope = { worker_id: z.string().min(1).max(100), job_id: z.string().uuid(), lease_token: z.string().uuid() };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enqueue'), broker_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('status'), broker_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('claim'), worker_id: scope.worker_id }).strict(),
  z.object({ action: z.literal('result'), ...scope, html: z.string().max(4000000) }).strict(),
  z.object({ action: z.literal('failure'), ...scope, status: z.number().int().min(400).max(599), error: z.string().max(2000), retry_after: z.number().min(0).max(180).default(0) }).strict(),
]);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // Authenticate before reading a potentially large machine payload.
  const machine = validWorkerCredential(Deno.env.get('BROKER_WA_WORKER_SHARED_SECRET') ?? '', req.headers.get('x-broker-wa-worker-secret') ?? '');
  const caller = machine ? null : await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  const admin = adminClient();
  if (!machine && (caller?.kind !== 'user' || !await isSuperAdmin(caller.userId, admin))) return json({ error: 'forbidden' }, 403);
  const raw = await req.text();
  if (raw.length > 4200000) return json({ error: 'payload_too_large' }, 413);
  const parsed = schema.safeParse(await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_input' }, 400);
  const input = parsed.data;
  const userAction = input.action === 'enqueue' || input.action === 'status';
  if ((machine && userAction) || (!machine && !userAction)) return json({ error: 'forbidden_action' }, 403);
  try {
    if (input.action === 'status') {
      const { data, error } = await admin.from('broker_whatsapp_jobs').select('id,status,last_error,attempts,updated_at').eq('broker_id', input.broker_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return json({ job: data });
    }
    if (input.action === 'enqueue') {
      if (caller?.kind !== 'user') return json({ error: 'forbidden' }, 403);
      const { data: onboarding, error: oe } = await admin.from('admin_broker_onboarding').select('imported_license_number').eq('user_id', input.broker_id).not('import_source', 'is', null).maybeSingle();
      const { data: demo, error: de } = await admin.from('demo_view_accounts').select('user_id').eq('user_id', input.broker_id).maybeSingle();
      const { data: roles, error: re } = await admin.from('user_roles').select('role').eq('user_id', input.broker_id);
      if (oe || de || re) throw oe ?? de ?? re;
      const brokerRoles = ['agent', 'lead_agent', 'managing_broker', 'junior_agent'];
      if (!onboarding || demo || roles?.some(r => ['developer', 'marketing_company'].includes(r.role)) || (!onboarding.imported_license_number && !roles?.some(r => brokerRoles.includes(r.role)))) return json({ error: 'החשבון אינו מתווך מיובא' }, 403);
      const activeJob = () => admin.from('broker_whatsapp_jobs').select('id,status,last_error,attempts').eq('broker_id', input.broker_id).in('status', ['pending','running','retry']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const {data: existing, error: existingError} = await activeJob();
      if(existingError)throw existingError;
      if(existing)return json({ok:true,job:existing});
      const { data: listings, error } = await admin.from('listings').select('id,source_url').eq('workspace_owner_id', input.broker_id).eq('user_id', input.broker_id).eq('source', 'yad2').not('source_url', 'is', null).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      const listing = listings?.find(l => /^https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?.*)?$/.test(l.source_url ?? ''));
      if (!listing?.source_url) return json({ error: 'אין מודעת יד2 שמורה ומזוהה עם המתווך' }, 422);
      const { data: job, error: insertError } = await admin.from('broker_whatsapp_jobs').insert({ broker_id: input.broker_id, workspace_owner_id: input.broker_id, listing_id: listing.id, source_url: listing.source_url, created_by: caller.userId }).select('id,status').single();
      if (insertError?.code === '23505') {
        const {data: concurrent, error: concurrentError} = await activeJob();
        if(concurrentError)throw concurrentError;
        if(concurrent)return json({ok:true,job:concurrent});
      }
      if (insertError) throw insertError;
      return json({ ok: true, job });
    }
    if (input.action === 'claim') {
      const { data, error } = await admin.rpc('claim_broker_whatsapp_job', { _worker: input.worker_id });
      if (error) throw error;
      return json({ job: data?.[0] ?? null });
    }
    if (input.action === 'result' || input.action === 'failure') {
      const { data: job, error: je } = await admin.from('broker_whatsapp_jobs').select('attempts').eq('id', input.job_id).single();
      if (je) throw je;
      const contact = input.action === 'result' ? discoverBrokerWhatsApp(input.html) : null;
      const { data, error } = await admin.rpc('finish_broker_whatsapp_discovery', { _id: input.job_id, _token: input.lease_token, _worker: input.worker_id, _phone: contact?.phone ?? null, _error: input.action === 'failure' ? input.error : null, _retry_seconds: input.action === 'failure' ? brokerWhatsAppRetry(input.status, job.attempts, input.retry_after) : 0 });
      if (error) throw error;
      return json(data);
    }
    return json({ error: 'unsupported_action' }, 400);
  } catch (reason) {
    const error = reason as { message?: string; code?: string };
    console.error('[broker-whatsapp-worker]', { action: input.action, code: error.code, error: error.message });
    return json({ error: error.message ?? 'worker_failed' }, error.code === '40001' ? 409 : error.code === '42501' ? 403 : 500);
  }
});