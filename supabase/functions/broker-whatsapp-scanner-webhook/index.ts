import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, safeEqual } from '../_shared/authz.ts';
import { processScannerEvent, scannerCredentials, scannerError, scannerReply } from '../_shared/brokerScannerRuntime.ts';
const schema=z.object({typeWebhook:z.string().max(100),instanceData:z.object({idInstance:z.union([z.string(),z.number()]),wid:z.string().max(100)}),idMessage:z.string().min(1).max(200).optional(),timestamp:z.number().finite().optional(),senderData:z.object({chatId:z.string().max(100),sender:z.string().max(100)}).optional(),messageData:z.record(z.unknown()).optional(),stateInstance:z.string().max(100).optional()});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  const credentials=scannerCredentials();
  if(!credentials||!safeEqual(req.headers.get('Authorization')??'',`Bearer ${credentials.webhook}`))return json({error:'unauthorized'},401);
  const admin=adminClient();
  try {
    const raw=await req.text();if(raw.length>20000)return json({error:'payload_too_large'},413);
    const parsed=schema.safeParse(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
    if(!parsed.success){await scannerError('webhook','invalid_authenticated_webhook',false,admin);return json({error:'invalid_webhook'},400);}
    const payload=parsed.data;
    const {data:settings,error:se}=await admin.from('broker_wa_scanner_settings').select('instance_id,scanner_phone').eq('id',true).maybeSingle();
    if(se)throw new Error('scanner_settings_read_failed');
    if(String(payload.instanceData.idInstance)!==credentials.instance||settings?.instance_id!==credentials.instance||payload.instanceData.wid!==`${settings.scanner_phone}@c.us`)return json({error:'wrong_scanner_instance'},403);
    if(payload.typeWebhook==='stateInstanceChanged') {
      // Fail closed on disconnect; an authorized body never resumes the circuit breaker.
      if(payload.stateInstance!=='authorized') {
        const {error}=await admin.from('broker_wa_scanner_settings').update({connected:false,paused:true,pause_reason:'scanner_disconnected',webhook_seen_at:new Date().toISOString()}).eq('id',true);
        if(error)throw new Error('scanner_disconnect_save_failed');
      }
      return json({ok:true});
    }
    if(payload.typeWebhook!=='incomingMessageReceived')return json({ok:true,ignored:true});
    if(!payload.idMessage||!payload.timestamp||!payload.senderData||!payload.messageData){await scannerError('webhook','incomplete_authenticated_reply',false,admin);return json({error:'invalid_reply'},400);}
    const reply=scannerReply(payload);
    if(reply.text.length>8000)return json({error:'reply_too_large'},413);
    if(reply.chat_id!==reply.sender||!/^\d+@c\.us$/.test(reply.chat_id))return json({ok:true,ignored:'not_direct_service_reply'});
    const eventAt=new Date(payload.timestamp*1000);if(!Number.isFinite(eventAt.getTime())||eventAt.getTime()>Date.now()+60000)return json({error:'invalid_timestamp'},400);
    const {data:event,error}=await admin.from('broker_wa_scanner_events').insert({instance_id:credentials.instance,message_id:payload.idMessage,event_type:payload.typeWebhook,chat_id:reply.chat_id,sender:reply.sender,quoted_id:reply.quoted_id,reply_text:reply.text,event_at:eventAt.toISOString()}).select('id').single();
    if(error&&error.code!=='23505')throw new Error('scanner_event_save_failed');
    const {error:ue}=await admin.from('broker_wa_scanner_settings').update({webhook_seen_at:new Date().toISOString(),webhook_errors:0}).eq('id',true);
    if(ue)throw new Error('scanner_webhook_health_save_failed');
    if(event)await processScannerEvent(event.id,admin);
    return json({ok:true,duplicate:!event});
  } catch(error) {
    console.error('[broker-wa-scanner-webhook]',{error:(error as Error).message});
    await scannerError('webhook','scanner_webhook_processing_error',false,admin).catch(()=>{});
    return json({error:'webhook_processing_failed'},500);
  }
});