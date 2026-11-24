import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin, requireCaller } from '../_shared/authz.ts';
import { validWorkerCredential } from '../_shared/externalImportWorker.ts';
import { extractYad2Inquiry, scannerDefaults, scannerJitter } from '../_shared/brokerScannerPolicy.ts';
import { checkScannerConnection, processScannerEvent, scannerCredentials, scannerError, scannerGreen } from '../_shared/brokerScannerRuntime.ts';
import { brokerFailure, brokerUserError, transientBrokerConnectionError } from '../_shared/brokerRecovery.ts';

const schema = z.discriminatedUnion('action',[
  z.object({action:z.literal('status'),broker_id:z.string().uuid().optional()}).strict(),
  z.object({action:z.literal('configure'),daily_cap:z.number().int().min(1).max(50),jitter_min_seconds:z.number().int().min(45).max(600),jitter_max_seconds:z.number().int().min(45).max(600),error_threshold:z.number().int().min(1).max(5)}).strict(),
  z.object({action:z.literal('test_connection')}).strict(),
  z.object({action:z.literal('resume')}).strict(),
  z.object({action:z.literal('pause')}).strict(),
  z.object({action:z.literal('enqueue'),broker_id:z.string().uuid(),confirmed:z.literal(true)}).strict(),
  z.object({action:z.literal('cancel'),job_id:z.string().uuid()}).strict(),
  z.object({action:z.literal('promote'),job_id:z.string().uuid()}).strict(),
  z.object({action:z.literal('claim_source')}).strict(),
  z.object({action:z.literal('source_result'),job_id:z.string().uuid(),lease_token:z.string().uuid(),html:z.string().max(4000000)}).strict(),
  z.object({action:z.literal('source_failure'),job_id:z.string().uuid(),lease_token:z.string().uuid(),status:z.number().int().min(400).max(599)}).strict(),
  z.object({action:z.literal('tick')}).strict(),
]);
const json = (body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
const active=['pending_source','reading_source','ready','sending','awaiting_reply'];

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  const suppliedSecret=req.headers.get('x-broker-wa-scanner-secret');
  const machine=validWorkerCredential(Deno.env.get('BROKER_WA_SCANNER_WORKER_SECRET')??'',suppliedSecret??'');
  if(suppliedSecret!==null&&!machine) {
    // A worker presented a scanner key that does not match Cloud: record it so the admin card shows it instead of failing silently.
    console.error('[broker-wa-scanner] worker_secret_rejected',{length:suppliedSecret.length});
    await adminClient().from('broker_wa_scanner_settings').update({worker_rejected_at:new Date().toISOString()}).eq('id',true).then(()=>{},()=>{});
    return json({error:'worker_secret_mismatch'},401);
  }
  const caller=machine?null:await requireCaller(req,['user']);
  if(caller instanceof Response)return caller;
  const admin=adminClient();
  if(!machine&&(caller?.kind!=='user'||!await isSuperAdmin(caller.userId,admin)))return json({error:'forbidden'},403);
  const raw=await req.text();
  if(raw.length>4200000)return json({error:'payload_too_large'},413);
  const input=schema.safeParse(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
  if(!input.success)return json({error:'invalid_input'},400);
  const body=input.data;
  const machineAction=['claim_source','source_result','source_failure','tick'].includes(body.action);
  if(machine!==machineAction)return json({error:'forbidden_action'},403);
  try {
    const {data:settings,error:se}=await admin.from('broker_wa_scanner_settings').select('*').eq('id',true).maybeSingle();
    if(se)throw brokerFailure('scanner_settings_read_failed',se);
    if(body.action==='status') {
      const {data:job,error:je}=body.broker_id?await admin.from('broker_wa_scanner_jobs').select('id,status,last_error,provider_status,reply_deadline,updated_at,created_at,queue_priority,next_source_at,lease_until,send_reserved_at').eq('broker_id',body.broker_id).order('created_at',{ascending:false}).limit(1).maybeSingle():{data:null,error:null};
      if(je)throw brokerFailure('scanner_job_read_failed',je);
      const {count,error:ce}=await admin.from('broker_wa_scanner_events').select('id',{head:true,count:'exact'}).eq('status','needs_manual');
      if(ce)throw brokerFailure('scanner_event_count_failed',ce);
      const {data:contact,error:co}=body.broker_id?await admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id',body.broker_id).eq('workspace_owner_id',body.broker_id).maybeSingle():{data:null,error:null};
      if(co)throw brokerFailure('scanner_contact_read_failed',co);
      // Queue order for the live countdown: jobs created earlier that will consume a send slot first.
      let queue_ahead=0, outstanding=false, outstanding_until:string|null=null;
      if(job&&['pending_source','reading_source','ready'].includes(job.status)){
        const {count:ahead,error:ae}=await admin.from('broker_wa_scanner_jobs').select('id',{head:true,count:'exact'}).in('status',['pending_source','reading_source','ready']).or(`queue_priority.gt.${job.queue_priority},and(queue_priority.eq.${job.queue_priority},created_at.lt.${job.created_at}),and(queue_priority.eq.${job.queue_priority},created_at.eq.${job.created_at},id.lt.${job.id})`);
        if(ae)throw brokerFailure('scanner_queue_read_failed',ae);queue_ahead=ahead??0;
        const {data:busy,error:be}=await admin.from('broker_wa_scanner_jobs').select('status,reply_deadline,send_reserved_at').in('status',['sending','awaiting_reply']).limit(1).maybeSingle();
        if(be)throw brokerFailure('scanner_queue_read_failed',be);outstanding=!!busy;
        outstanding_until=busy?.status==='awaiting_reply'?busy.reply_deadline:busy?.send_reserved_at?new Date(Date.parse(busy.send_reserved_at)+90000).toISOString():null;
      }
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date());
      return json({queue_ahead,outstanding,outstanding_until,settings:settings??{...scannerDefaults,enabled:false,paused:true,pause_reason:'not_configured'},credentials_ready:!!scannerCredentials(),used_today:settings?.budget_day===today?settings.day_attempts:0,manual_replies:count??0,job,contact});
    }
    if(body.action==='configure') {
      if(body.jitter_max_seconds<body.jitter_min_seconds)return json({ok:false,error:'טווח ההשהיה אינו תקין'});
      const {action,...values}=body;
      const {error}=await admin.from('broker_wa_scanner_settings').upsert({id:true,...values,paused:true,pause_reason:'configuration_changed',updated_by:caller?.kind==='user'?caller.userId:null,updated_at:new Date().toISOString()});
      if(error)throw brokerFailure('scanner_settings_save_failed',error);
      return json({ok:true});
    }
    if(body.action==='pause') {
      const {error}=await admin.from('broker_wa_scanner_settings').update({paused:true,pause_reason:'user_paused',updated_at:new Date().toISOString()}).eq('id',true);
      if(error)throw brokerFailure('scanner_pause_failed',error);return json({ok:true});
    }
    if(body.action==='test_connection'||body.action==='resume') {
      if(!settings)return json({ok:false,reason:'save_settings_first'});
      const check=await checkScannerConnection(admin);
      if(!check.ok){await scannerError('send',check.reason??'scanner_not_ready',true,admin);return json(check);}
      if(body.action==='resume') {
        const {error}=await admin.from('broker_wa_scanner_settings').update({enabled:true,paused:false,pause_reason:null,send_errors:0,webhook_errors:0,updated_at:new Date().toISOString()}).eq('id',true);
        if(error)throw brokerFailure('scanner_resume_failed',error);
      }
      return json(check);
    }
    if(body.action==='cancel') {
      const {error}=await admin.from('broker_wa_scanner_jobs').update({status:'cancelled',last_error:'user_cancelled',lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',body.job_id).in('status',active);
      if(error)throw brokerFailure('scanner_cancel_failed',error);return json({ok:true});
    }
    if(body.action==='promote') {
      if(caller?.kind!=='user')return json({error:'forbidden'},403);
      const {data,error}=await admin.rpc('promote_broker_wa_scanner_job',{_job:body.job_id,_actor:caller.userId});
      if(error)throw brokerFailure('scanner_promote_failed',error);
      return data?json({ok:true}):json({ok:false,error:'ניתן לקדם רק פנייה שממתינה בתור וללא מספר שמור'});
    }
    if(body.action==='enqueue') {
      if(caller?.kind!=='user')return json({error:'forbidden'},403);
      if(!settings?.enabled||settings.paused||!scannerCredentials())return json({ok:false,error:'קו הסריקה אינו פעיל'});
      const {data:contact,error:ce}=await admin.from('broker_whatsapp_contacts').select('broker_id').eq('broker_id',body.broker_id).maybeSingle();
      if(ce)throw brokerFailure('scanner_contact_read_failed',ce);
      if(contact)return json({ok:false,error:'כבר שמור מספר WhatsApp אישי'});
      const {data:listings,error:le}=await admin.from('listings').select('id,source_url').eq('workspace_owner_id',body.broker_id).eq('user_id',body.broker_id).eq('source','yad2').not('source_url','is',null).order('created_at',{ascending:false}).limit(50);
      if(le)throw brokerFailure('scanner_source_read_failed',le);
      const source=listings?.find(row=>/^https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?.*)?$/.test(row.source_url??''));
      if(!source?.source_url)return json({ok:false,error:'אין למתווך מודעת יד2 שמורה'});
      const {data:eligible,error:ee}=await admin.rpc('scanner_broker_eligible',{_broker:body.broker_id,_listing:source.id,_creator:caller.userId,_source:source.source_url});
      if(ee)throw brokerFailure('scanner_eligibility_check_failed',ee);if(!eligible)return json({error:'forbidden_broker'},403);
      const {data:job,error:ie}=await admin.from('broker_wa_scanner_jobs').insert({broker_id:body.broker_id,workspace_owner_id:body.broker_id,listing_id:source.id,source_url:source.source_url,created_by:caller.userId,consent_at:new Date().toISOString()}).select('id,status').single();
      if(ie?.code==='23505')return json({ok:false,error:'כבר קיימת פנייה למתווך או למודעה זו; לא תישלח פנייה כפולה'});
      if(ie)throw brokerFailure('scanner_enqueue_failed',ie);return json({ok:true,job});
    }
    if(body.action==='claim_source') {
      const {data,error}=await admin.rpc('claim_broker_wa_scanner_source');if(error)throw brokerFailure('scanner_source_claim_failed',error);return json({job:data?.[0]??null});
    }
    if(body.action==='source_result'||body.action==='source_failure') {
      const {data:job,error}=await admin.from('broker_wa_scanner_jobs').select('*').eq('id',body.job_id).eq('status','reading_source').eq('lease_token',body.lease_token).gt('lease_until',new Date().toISOString()).maybeSingle();
      if(error)throw brokerFailure('scanner_source_job_read_failed',error);if(!job)return json({error:'stale_source_lease'},409);
      if(body.action==='source_failure') {
        const retry=[429,500,502,503,504].includes(body.status)&&job.source_attempts<3;
        const {error:ue}=await admin.from('broker_wa_scanner_jobs').update({status:retry?'pending_source':'needs_manual',next_source_at:new Date(Date.now()+180000).toISOString(),last_error:`source_http_${body.status}`,provider_status:body.status,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','reading_source').eq('lease_token',body.lease_token);
        if(ue)throw brokerFailure('scanner_source_failure_save_failed',ue);
        if([401,403,407].includes(body.status))await scannerError('send',`source_access_denied_${body.status}`,true,admin);
        return json({ok:true});
      }
      const extraction=extractYad2Inquiry(body.html,job.source_url);
      const {error:ue}=await admin.from('broker_wa_scanner_jobs').update({status:extraction.inquiry?'ready':'needs_manual',target_phone:extraction.inquiry?.target_phone??null,prefilled_message:extraction.inquiry?.prefilled_message??null,last_error:extraction.inquiry?null:extraction.reason,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','reading_source').eq('lease_token',body.lease_token);
      if(ue)throw brokerFailure('scanner_source_save_failed',ue);return json({ok:true,reason:extraction.reason});
    }
    if(body.action==='tick') {
      // Heartbeat first, even while paused, so the admin card can tell "worker connected" apart from "line paused".
      if(settings){const {error:heartbeatError}=await admin.from('broker_wa_scanner_settings').update({worker_seen_at:new Date().toISOString()}).eq('id',true);
      if(heartbeatError)throw brokerFailure('scanner_heartbeat_save_failed',heartbeatError);}
      if(!settings?.enabled||settings.paused)return json({ok:true,idle:true});
      const {data:events,error:ev}=await admin.from('broker_wa_scanner_events').select('id').eq('status','received').order('created_at').limit(5);
      if(ev)throw brokerFailure('scanner_replay_read_failed',ev);
      for(const event of events??[]) {
        try { await processScannerEvent(event.id,admin); }
        catch(error) { if (!transientBrokerConnectionError(error)) throw error; console.warn('[broker-wa-scanner] event_replay_deferred',{event_id:event.id}); }
      }
      const credentials=scannerCredentials();if(!credentials){await scannerError('send','scanner_credentials_missing',true,admin);return json({ok:false,reason:'scanner_credentials_missing'});}
      // Preflight only when a send might be due; never poll the provider while idle.
      const {count,error:re}=await admin.from('broker_wa_scanner_jobs').select('id',{head:true,count:'exact'}).eq('status','ready');
      if(re)throw brokerFailure('scanner_ready_read_failed',re);
      if(!count)return json({ok:true,idle:true});
      // 24/7: no daytime window; pacing (next_send_at), daily quota and the error circuit breaker remain.
      if(Date.parse(settings.next_send_at??'')>Date.now())return json({ok:true,idle:true});
      const {count:waiting,error:we}=await admin.from('broker_wa_scanner_jobs').select('id',{head:true,count:'exact'}).in('status',['sending','awaiting_reply']);
      if(we)throw brokerFailure('scanner_waiting_read_failed',we);
      if(waiting) {
        // Recovery only, no provider call: stale sends are manual, never resent.
        const now=new Date().toISOString();
        const {error:expired}=await admin.from('broker_wa_scanner_jobs').update({status:'needs_manual',last_error:'reply_timeout_or_unknown_send',updated_at:now}).or(`and(status.eq.sending,send_reserved_at.lt.${new Date(Date.now()-90000).toISOString()}),and(status.eq.awaiting_reply,reply_deadline.lt.${now})`);
        if(expired)throw brokerFailure('scanner_timeout_update_failed',expired);return json({ok:true,idle:true});
      }
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date());
      if(settings.budget_day===today&&settings.day_attempts>=settings.daily_cap)return json({ok:true,idle:true});
      const check=await checkScannerConnection(admin);
      if(!check.ok||!check.phone){await scannerError('send',check.reason??'scanner_not_ready',true,admin);return json(check);}
      const {data:claimed,error:cl}=await admin.rpc('reserve_broker_wa_scanner_send',{_instance:credentials.instance,_phone:check.phone,_jitter:scannerJitter(settings.jitter_min_seconds,settings.jitter_max_seconds)});
      if(cl)throw brokerFailure('scanner_send_reserve_failed',cl);
      const job=claimed?.[0];if(!job)return json({ok:true,idle:true});
      // Reserve consumed quota before networking; ambiguous outcomes never get retried.
      try {
        const {data:fresh,error:fe}=await admin.from('broker_wa_scanner_settings').select('paused,enabled').eq('id',true).single();
        const {data:current,error:je}=await admin.from('broker_wa_scanner_jobs').select('status').eq('id',job.id).single();
        const {data:saved,error:ce}=await admin.from('broker_whatsapp_contacts').select('broker_id').eq('broker_id',job.broker_id).maybeSingle();
        if(fe||je||ce)throw new Error('scanner_presend_check_failed');
        if(fresh.paused||!fresh.enabled||current.status!=='sending'||saved)return json({ok:true,cancelled:true});
        const sent=await scannerGreen('sendMessage',{chatId:`${job.target_phone}@c.us`,message:job.prefilled_message});
        if(typeof sent.idMessage!=='string'||!sent.idMessage)throw Object.assign(new Error('green_no_message_id'),{status:502});
        const {error:ue}=await admin.from('broker_wa_scanner_jobs').update({status:'awaiting_reply',provider_message_id:sent.idMessage,provider_status:200,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','sending').eq('send_token',job.send_token);
        if(ue)throw new Error('scanner_send_commit_unknown');
        const {error:reset}=await admin.from('broker_wa_scanner_settings').update({send_errors:0}).eq('id',true);if(reset)throw new Error('scanner_success_record_failed');
        return json({ok:true,sent:true});
      } catch(error) {
        const status=Number((error as {status?:number}).status??504);
        const {error:ue}=await admin.from('broker_wa_scanner_jobs').update({status:'needs_manual',last_error:`send_outcome_unknown_or_failed_${status}`,provider_status:status,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','sending');
        if(ue)throw new Error('scanner_unknown_send_record_failed');
        await scannerError('send',`scanner_send_error_${status}`,[401,403,429].includes(status),admin);return json({ok:false,reason:'send_needs_manual',status});
      }
    }
    return json({error:'unsupported_action'},400);
  } catch(error) {
    console.error('[broker-wa-scanner]',{action:body.action,error:(error as Error).message});
    const transient = transientBrokerConnectionError(error);
    // A failed infrastructure read is not evidence of a disconnected line or a failed send.
    // Actual send failures still take the reserved-send/manual-review path above and retain the circuit breaker.
    if(!transient&&(machineAction||body.action==='test_connection'||body.action==='resume'))await scannerError('send','scanner_operation_error',true,admin).catch(()=>{});
    return json({error:brokerUserError(error,'פעולת קו הסריקה לא הושלמה. נסו שוב בעוד רגע.'),retryable:transient},transient?503:500);
  }
});