import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin, requireCaller } from '../_shared/authz.ts';
import { validWorkerCredential } from '../_shared/externalImportWorker.ts';
import { brokerWhatsAppRetry, inspectBrokerWhatsApp, discoverBrokerTelephone, normalizeBrokerWhatsApp } from '../_shared/brokerWhatsApp.ts';
import { continueBrokerScanner } from '../_shared/brokerScannerContinuation.ts';
import { brokerUserError, recoverBrokerWhatsAppJobs } from '../_shared/brokerRecovery.ts';

const scope = { worker_id: z.string().min(1).max(100), job_id: z.string().uuid(), lease_token: z.string().uuid() };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enqueue'), broker_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('status'), broker_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('batch_status') }).strict(),
  z.object({ action: z.literal('bulk_targets') }).strict(),
  z.object({ action: z.literal('start_batch') }).strict(),
  z.object({ action: z.literal('cancel_batch'), batch_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('enqueue_missing'), batch_id: z.string().uuid(), after: z.string().uuid().optional(), broker_ids: z.array(z.string().uuid()).min(1).max(5000).optional() }).strict(),
  z.object({ action: z.literal('save_contact'), broker_id: z.string().uuid(), phone: z.string().max(25) }).strict(),
  z.object({ action: z.literal('heartbeat'), ...scope }).strict(),
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
  const userAction = ['enqueue', 'status', 'enqueue_missing', 'save_contact', 'batch_status', 'start_batch', 'cancel_batch', 'bulk_targets'].includes(input.action);
  if ((machine && userAction) || (!machine && !userAction)) return json({ error: 'forbidden_action' }, 403);
  try {
    if (input.action === 'bulk_targets') {
      // Same eligibility as enqueue, without source reads, queue creation or sending.
      const all = async (make: (from: number, to: number) => any) => {
        const rows: any[] = [];
        for (let from = 0; ; from += 500) { const {data,error} = await make(from, from + 499); if(error)throw error; rows.push(...(data ?? [])); if((data?.length ?? 0) < 500)return rows; }
      };
      const [onboarding, roles, demos, contacts, jobs, inquiries, listings, profiles] = await Promise.all([
        all((f,t) => admin.from('admin_broker_onboarding').select('user_id,imported_license_number,created_at').not('import_source','is',null).order('user_id').range(f,t)),
        all((f,t) => admin.from('user_roles').select('user_id,role').order('id').range(f,t)),
        all((f,t) => admin.from('demo_view_accounts').select('user_id').order('user_id').range(f,t)),
        all((f,t) => admin.from('broker_whatsapp_contacts').select('broker_id').order('broker_id').range(f,t)),
        all((f,t) => admin.from('broker_whatsapp_jobs').select('broker_id').in('status',['pending','running','retry']).order('id').range(f,t)),
        all((f,t) => admin.from('broker_wa_scanner_jobs').select('broker_id').in('status',['pending_source','reading_source','ready','sending','awaiting_reply']).order('id').range(f,t)),
        all((f,t) => admin.from('listings').select('user_id,workspace_owner_id,source_url').eq('source','yad2').not('source_url','is',null).order('id').range(f,t)),
        all((f,t) => admin.from('profiles').select('id,full_name').order('id').range(f,t)),
      ]);
      const excluded = new Set([...demos.map(r=>r.user_id), ...contacts.map(r=>r.broker_id), ...jobs.map(r=>r.broker_id), ...inquiries.map(r=>r.broker_id)]);
      const sources = new Set(listings.filter(r=>r.user_id===r.workspace_owner_id && /^https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?.*)?$/.test(r.source_url)).map(r=>r.user_id));
      const brokers = onboarding.filter(r => {
        const own = roles.filter(role=>role.user_id===r.user_id).map(role=>role.role);
        return !excluded.has(r.user_id) && sources.has(r.user_id) && !own.some(role=>['developer','marketing_company'].includes(role)) && (r.imported_license_number || own.some(role=>['agent','lead_agent','managing_broker','junior_agent'].includes(role)));
      }).map(r=>({user_id:r.user_id,created_at:r.created_at,full_name:profiles.find(p=>p.id===r.user_id)?.full_name ?? ''}));
      return json({brokers});
    }
    if (userAction || input.action==='claim') {
      const recovery = await recoverBrokerWhatsAppJobs(admin);
      if (!recovery.recovered) console.warn('[broker-whatsapp-recovery-deferred]', { action: input.action, attempts: recovery.attempts, transient: recovery.transient });
    }
    if (input.action === 'batch_status' || input.action === 'start_batch' || input.action === 'cancel_batch') {
      if (caller?.kind !== 'user') return json({error:'forbidden'},403);
      if (input.action === 'cancel_batch') {
        const {data,error}=await admin.rpc('cancel_broker_whatsapp_batch',{_id:input.batch_id,_creator:caller.userId});
        if(error)throw error;
        return json({ok:true,cancelled:data});
      }
      const {data:latest,error}=await admin.from('broker_whatsapp_batches').select('id,status,enqueue_finished').eq('created_by',caller.userId).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error)throw error;
      let batch=latest;
      if(batch?.status==='running' && batch.enqueue_finished) {
        const {count,error:ce}=await admin.from('broker_whatsapp_jobs').select('id',{count:'exact',head:true}).eq('batch_id',batch.id).in('status',['pending','running','retry']);
        if(ce)throw ce;
        if(count===0) {
          const {data:finished,error:fe}=await admin.from('broker_whatsapp_batches').update({status:'completed',updated_at:new Date().toISOString()}).eq('id',batch.id).eq('status','running').select('id,status,enqueue_finished').maybeSingle();
          if(fe)throw fe;
          batch=finished??{...batch,status:'completed'};
        }
      }
      if(input.action==='batch_status' || batch?.status==='running')return json({batch});
      const {data:started,error:se}=await admin.from('broker_whatsapp_batches').insert({created_by:caller.userId}).select('id,status,enqueue_finished').single();
      if(se)throw se;
      return json({batch:started});
    }
    const enqueue=async(brokerId:string,batchId?:string)=> {
      if(caller?.kind!=='user')throw Object.assign(new Error('forbidden'),{code:'42501'});
      const { data: onboarding, error: oe } = await admin.from('admin_broker_onboarding').select('imported_license_number').eq('user_id', brokerId).not('import_source', 'is', null).maybeSingle();
      const { data: demo, error: de } = await admin.from('demo_view_accounts').select('user_id').eq('user_id', brokerId).maybeSingle();
      const { data: roles, error: re } = await admin.from('user_roles').select('role').eq('user_id', brokerId);
      if (oe || de || re) throw oe ?? de ?? re;
      const brokerRoles = ['agent', 'lead_agent', 'managing_broker', 'junior_agent'];
      if (!onboarding || demo || roles?.some(r => ['developer', 'marketing_company'].includes(r.role)) || (!onboarding.imported_license_number && !roles?.some(r => brokerRoles.includes(r.role)))) throw Object.assign(new Error('החשבון אינו מתווך מיובא'), { code: '42501' });
      const activeJob = () => admin.from('broker_whatsapp_jobs').select('id,status,last_error,attempts').eq('broker_id', brokerId).in('status', ['pending','running','retry']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const {data: existing, error: existingError} = await activeJob();
      if(existingError)throw existingError;
      if(existing)return {ok:true,job:existing};
      const {data: inquiry,error: ie} = await admin.from('broker_wa_scanner_jobs').select('id').eq('broker_id',brokerId).in('status',['pending_source','reading_source','ready','sending','awaiting_reply']).limit(1).maybeSingle();
      if(ie)throw ie;
      if(inquiry)throw new Error('גילוי המספר כבר ממתין בתור הסריקה');
      const { data: listings, error } = await admin.from('listings').select('id,source_url').eq('workspace_owner_id', brokerId).eq('user_id', brokerId).eq('source', 'yad2').not('source_url', 'is', null).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      const listing = listings?.find(l => /^https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?.*)?$/.test(l.source_url ?? ''));
      if (!listing?.source_url) throw Object.assign(new Error('אין מודעת יד2 שמורה ומזוהה עם המתווך'), { code: 'no_source' });
      const { data: job, error: insertError } = await admin.from('broker_whatsapp_jobs').insert({ broker_id: brokerId, workspace_owner_id: brokerId, listing_id: listing.id, source_url: listing.source_url, created_by: caller.userId, batch_id: batchId ?? null }).select('id,status').single();
      if (insertError?.code === '23505') {
        const {data: concurrent, error: concurrentError} = await activeJob();
        if(concurrentError)throw concurrentError;
        if(concurrent)return {ok:true,job:concurrent};
      }
      if (insertError) throw insertError;
      return { ok: true, job };
    };
    if (input.action === 'status') {
      const { data, error } = await admin.from('broker_whatsapp_jobs').select('id,status,last_error,attempts,updated_at,discovered_phone').eq('broker_id', input.broker_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      const { data: contact, error: ce } = await admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id', input.broker_id).eq('workspace_owner_id', input.broker_id).maybeSingle();
      if (ce) throw ce;
      return json({ job: data, contact: contact ?? null });
    }
    if (input.action === 'enqueue') return json(await enqueue(input.broker_id));
    if (input.action === 'enqueue_missing') {
      if(caller?.kind!=='user')return json({error:'forbidden'},403);
      const {data:batch,error:be}=await admin.from('broker_whatsapp_batches').select('id,status').eq('id',input.batch_id).eq('created_by',caller.userId).maybeSingle();
      if(be)throw be;
      if(!batch)return json({error:'forbidden_batch'},403);
      if(batch.status!=='running')return json({results:[],next:null,stopped:true});
      let query = admin.from('admin_broker_onboarding').select('user_id').not('import_source','is',null).order('user_id').limit(20);
      if (input.broker_ids) query = query.in('user_id', input.broker_ids);
      if (input.after) query = query.gt('user_id',input.after);
      const {data: rows,error} = await query;
      if(error)throw error;
      const results: {broker_id:string;status:string;error?:string}[]=[];
      for(const row of rows??[]) {
        const {data: contact,error: ce}=await admin.from('broker_whatsapp_contacts').select('broker_id').eq('broker_id',row.user_id).maybeSingle();
        if(ce)throw ce;
        if(contact){results.push({broker_id:row.user_id,status:'already_set'});continue;}
        try {await enqueue(row.user_id,input.batch_id);results.push({broker_id:row.user_id,status:'queued'});}
        catch(reason){if((reason as Error).message.includes('whatsapp_batch_stopped'))return json({results,next:null,stopped:true});results.push({broker_id:row.user_id,status:'skipped',error:brokerUserError(reason)});}
      }
      const next=rows?.length===20?rows[rows.length-1]?.user_id:null;
      if(!next) {
        const {error:fe}=await admin.from('broker_whatsapp_batches').update({enqueue_finished:true,updated_at:new Date().toISOString()}).eq('id',input.batch_id).eq('created_by',caller.userId).eq('status','running');
        if(fe)throw fe;
      }
      return json({results,next});
    }
    if (input.action === 'save_contact') {
      if(caller?.kind!=='user')return json({error:'forbidden'},403);
      const clearing = input.phone.trim() === '';
      const phone=clearing ? null : normalizeBrokerWhatsApp(input.phone);
      if(!clearing && !phone)return json({error:'יש להזין נייד ישראלי תקין'},400);
      const {data: broker,error: be}=await admin.from('admin_broker_onboarding').select('user_id').eq('user_id',input.broker_id).not('import_source','is',null).maybeSingle();
      const {data: demo,error: de}=await admin.from('demo_view_accounts').select('user_id').eq('user_id',input.broker_id).maybeSingle();
      const {data: roles,error: re}=await admin.from('user_roles').select('role').eq('user_id',input.broker_id);
      if(be||de||re)throw be??de??re;
      if(!broker||demo||roles?.some(r=>['developer','marketing_company'].includes(r.role)))return json({error:'forbidden'},403);
      if (clearing) {
        const {error}=await admin.from('broker_whatsapp_contacts').delete().eq('broker_id',input.broker_id).eq('workspace_owner_id',input.broker_id);
        if(error)throw error;
        await admin.from('audit_logs').insert({actor_id:caller.userId,action:'super_admin.broker_whatsapp_manual_clear',target_table:'broker_whatsapp_contacts',target_id:input.broker_id,details:{manual:true}});
        return json({ok:true,phone:null});
      }
      const {data: shared,error: se}=await admin.from('broker_whatsapp_shared_numbers').select('whatsapp_phone').eq('whatsapp_phone',phone).maybeSingle();
      if(se)throw se;
      if(shared)return json({error:'זה מספר WhatsApp משותף של יד2 ולא של המתווך'},400);
      const {data,error}=await admin.from('broker_whatsapp_contacts').upsert({broker_id:input.broker_id,workspace_owner_id:input.broker_id,whatsapp_phone:phone,whatsapp_link:`https://wa.me/${phone}`,source_url:'manual',discovered_at:new Date().toISOString()}).select('whatsapp_phone').single();
      if(error)throw error;
      await admin.from('audit_logs').insert({actor_id:caller.userId,action:'super_admin.broker_whatsapp_manual_set',target_table:'broker_whatsapp_contacts',target_id:input.broker_id,details:{manual:true}});
      return json({ok:true,phone:data.whatsapp_phone});
    }
    if (input.action === 'heartbeat') {
      const {data,error}=await admin.rpc('heartbeat_broker_whatsapp_job',{_id:input.job_id,_token:input.lease_token,_worker:input.worker_id});
      if(error)throw error;
      return data?json({ok:true}):json({error:'stale_worker_lease'},409);
    }
    if (input.action === 'claim') {
      const { data, error } = await admin.rpc('claim_broker_whatsapp_job', { _worker: input.worker_id });
      if (error) throw error;
      return json({ job: data?.[0] ?? null });
    }
    if (input.action === 'result' || input.action === 'failure') {
      const { data: job, error: je } = await admin.from('broker_whatsapp_jobs').select('id,attempts,source_url,broker_id,listing_id,created_by').eq('id', input.job_id).single();
      if (je) throw je;
      if(input.action==='result') {
        const telephone=discoverBrokerTelephone(input.html, job.source_url);
        const {error}=await admin.from('broker_whatsapp_jobs').update({discovered_phone:telephone}).eq('id',input.job_id).eq('status','running').eq('lease_token',input.lease_token).eq('worker_id',input.worker_id).gt('lease_until',new Date().toISOString());
        if(error)throw error;
      }
      const extraction = input.action === 'result' ? inspectBrokerWhatsApp(input.html, job.source_url) : null;
      const contact = extraction?.contact;
      const { data, error } = await admin.rpc('finish_broker_whatsapp_discovery', { _id: input.job_id, _token: input.lease_token, _worker: input.worker_id, _phone: contact?.phone ?? null, _error: input.action === 'failure' ? input.error : null, _retry_seconds: input.action === 'failure' ? brokerWhatsAppRetry(input.status, job.attempts, input.retry_after) : 0 });
      if (!error && input.action === 'result' && !contact?.phone) {
        try { await continueBrokerScanner(admin, job); }
        catch { console.error('broker_scanner_continuation_failed',{job_id:job.id}); }
      }
      if (error) throw error;
      if (extraction) console.log('[broker-whatsapp-extraction]', { job_id: input.job_id, main_count: extraction.mainCount, candidates: extraction.candidates, reason: extraction.reason, saved: !!contact && data?.ok === true && !data?.shared, shared: !!data?.shared });
      return json({ ...data, extraction: extraction ? { main_count: extraction.mainCount, candidates: extraction.candidates, reason: data?.shared ? 'shared_whatsapp_number' : extraction.reason } : undefined });
    }
    return json({ error: 'unsupported_action' }, 400);
  } catch (reason) {
    const error = reason as { message?: string; code?: string };
    console.error('[broker-whatsapp-worker]', { action: input.action, code: error.code, error: error.message });
    return json({ error: brokerUserError(reason) }, error.code === '40001' ? 409 : error.code === '42501' ? 403 : 500);
  }
});