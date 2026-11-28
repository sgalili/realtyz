import { shortBrokerDemoCall } from './brokerOutreachPolicy';
import type { Json } from '@/integrations/supabase/types';
import { IVR_DEFAULT_VOICES, IVR_MODEL_ID, IVR_VOICE_SETTINGS } from '../../supabase/functions/_shared/ivrVoices';
import { invitationLink, publicSiteOrigin } from '../../supabase/functions/_shared/importInvitationPolicy';
import { loadBrokerRitaContext, generateBrokerRitaScript } from './brokerRitaContext.server';

type Admin = (typeof import('@/integrations/supabase/client.server'))['supabaseAdmin'];
export async function outreachEvent(admin: Admin, brokerId: string, kind: string, detail: Record<string, unknown> = {}) {
  const { error } = await admin.from('broker_outreach_events').insert({ broker_id: brokerId, workspace_owner_id: brokerId, event_key: `${kind}:${crypto.randomUUID()}`, kind, detail: JSON.parse(JSON.stringify(detail)) as Json });
  if (error) throw error;
}

export async function cancelBrokerDemo(admin: Admin, brokerId: string) {
  const { data: cancelled, error } = await admin.rpc('cancel_rita_broker_demo', { _broker: brokerId });
  if (error) throw error;
  await outreachEvent(admin, brokerId, cancelled ? 'call_cancelled' : 'cancel_requested');
  return { cancelled: !!cancelled, pending: !cancelled };
}

export async function scheduleBrokerDemo(admin: Admin, brokerId: string) {
  const { data: queued, error } = await admin.rpc('arm_rita_broker_demo', { _broker: brokerId });
  if (error) throw error;
  if (queued) await outreachEvent(admin, brokerId, 'call_scheduled', { provider: 'elevenlabs' });
}

/** Claimed once at the server-owned due time by the existing minute dispatcher. */
export async function dispatchBrokerDemo(admin: Admin, brokerId: string) {
  const { data: claimed, error } = await admin.rpc('claim_rita_broker_demo', { _broker: brokerId });
  if (error) throw error;
  if (!claimed || typeof claimed !== 'object' || Array.isArray(claimed)) return { dispatched: false };
  const verifiedPhone = typeof claimed['otp_verified_phone'] === 'string' ? claimed['otp_verified_phone'] : '';
  try {
    const context = await loadBrokerRitaContext(admin, brokerId);
    const script = shortBrokerDemoCall(context.firstName, context.gender);
    const { startRitaOutboundCall } = await import('./ritaVoiceOutbound.server');
    const result = await startRitaOutboundCall({ admin, userClient: admin, userId: null, service: true, rawInput: {
      workspace_owner_id: brokerId, phone_number: verifiedPhone, full_name: context.firstName,
      source: 'broker_invitation', call_role: 'broker_invite',
      invite_context: context.facts.slice(0, 1500),
      instructions: script.prompt.slice(0, 1500),
    } });
    const { error: savedError } = await admin.from('broker_outreach_journeys').update({ call_provider_id: result.conversation_id, call_status: 'pending', last_error: null }).eq('broker_id', brokerId).eq('call_status', 'scheduling');
    if (savedError) throw savedError;
    await outreachEvent(admin, brokerId, 'call_dispatched', { provider: 'elevenlabs', conversation_id: result.conversation_id });
    return { dispatched: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'השיחה לא נשלחה';
    await admin.from('broker_outreach_journeys').update({ call_status: 'blocked', last_error: reason }).eq('broker_id', brokerId).eq('call_status', 'scheduling');
    await outreachEvent(admin, brokerId, 'call_dispatch_failed', { reason });
    // No automatic replay after an ambiguous provider request.
    return { dispatched: false, blocked: true };
  }
}

export async function officialOutreachSend(admin: Admin, ownerId: string, payload: Record<string, unknown>) {
  if(typeof payload['audio_url']==='string'){
    const {data:rows,error}=await admin.from('wa_providers').select('config').eq('provider_name','WBA').eq('is_official',true).eq('is_active',true).order('updated_at',{ascending:false});
    if(error)throw error;
    const cfg=(rows??[]).map(row=>row.config as Record<string,unknown>).find(c=>String(c['display_phone_number']??c['phone_number']??'').replace(/\D/g,'')==='972537983832');
    const token=cfg?.['access_token']??process.env['META_WA_ACCESS_TOKEN'];
    const version=String(cfg?.['api_version']??'v25.0');
    if(!cfg?.['phone_number_id']||!token||!/^v\d+\.0$/.test(version))throw new Error('המספר הרשמי אינו מוגדר לשליחת הקלטה');
    const audio=new URL(payload['audio_url']);const appStorage=process.env['SUPABASE_URL'];
    if(!appStorage||audio.origin!==new URL(appStorage).origin||!audio.pathname.startsWith(`/storage/v1/object/sign/ivr-audio/${ownerId}/`))throw new Error('ההקלטה אינה שייכת לשולח המורשה');
    const response=await fetch(`https://graph.facebook.com/${version}/${cfg['phone_number_id']}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:payload['phone_number'],type:'audio',audio:{link:payload['audio_url']}}),signal:AbortSignal.timeout(15_000)});
    const raw=await response.text();if(!response.ok){console.error('[broker-outreach-audio]',response.status,raw.slice(0,2000));throw new Error(`Meta דחתה שליחת הקלטה (${response.status})`);}
    const body=JSON.parse(raw) as {messages?:{id?:string}[]};const id=body.messages?.[0]?.id;if(!id)throw new Error('השליחה לא החזירה מזהה הודעה');return id;
  }
  const key=process.env['SUPABASE_SERVICE_ROLE_KEY']; const url=process.env['SUPABASE_URL'];
  if(!key||!url)throw new Error('חיבור השליחה הרשמי אינו זמין');
  const response=await fetch(`${url}/functions/v1/send-whatsapp`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({...payload,tenant_id:ownerId,force_official:true}),signal:AbortSignal.timeout(15_000)});
  const raw=await response.text();
  if(!response.ok){console.error('[broker-outreach-whatsapp]',response.status,raw.slice(0,2000));throw new Error(`שליחת WhatsApp לא התקבלה (${response.status})`);}
  const data=JSON.parse(raw) as {success?:boolean;message_id?:string;error?:string};
  if(!data.success||!data.message_id)throw new Error(data.error??'השליחה לא החזירה מזהה הודעה');
  void admin;
  return data.message_id;
}

export async function sendBrokerVoice(admin: Admin, brokerId: string) {
  const key=process.env['ELEVENLABS_API_KEY'];const voiceId=IVR_DEFAULT_VOICES[0].voice_id;
  if(!key||!voiceId)throw new Error('נדרש חיבור ElevenLabs וקול ריטה שמור');
  const {data:j,error:je}=await admin.from('broker_outreach_journeys').select('*').eq('broker_id',brokerId).single();
  if(je)throw je;
  if(!j.enabled||!j.interested_at||j.opted_out_at||j.voice_status!=='pending')return;
  const emailReply=j.outreach_channel==='email';
  if(!emailReply&&Date.parse(j.interested_at)<Date.now()-86_400_000)throw new Error('חלון התגובה של WhatsApp הסתיים; נדרשת שיחה חדשה לפני שליחת הקלטה');
  const {data:contact,error:ce}=emailReply?{data:null,error:null}:await admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id',brokerId).eq('workspace_owner_id',brokerId).single();
  const {data:p,error:pe}=await admin.from('profiles').select('full_name,gender,email').eq('id',brokerId).single();
  if(ce||pe)throw ce??pe;
  // The login link is sent only now, after the broker replied positively to the first contact.
  const {data:onboarding}=await admin.from('admin_broker_onboarding').select('invitation_link_token').eq('user_id',brokerId).maybeSingle();
  const loginLink=onboarding?.invitation_link_token?invitationLink(publicSiteOrigin(process.env['PUBLIC_SITE_URL']??''),brokerId,onboarding.invitation_link_token):null;
  const {data:claim,error:claimError}=await admin.from('broker_outreach_journeys').update({voice_status:'generating'}).eq('broker_id',brokerId).eq('voice_status','pending').is('opted_out_at',null).select('broker_id').maybeSingle();
  if(claimError)throw claimError;if(!claim)return;
  try {
    const context=await loadBrokerRitaContext(admin,brokerId);
    const aiKey=process.env['LOVABLE_API_KEY'];if(!aiKey)throw new Error('מנוע הנוסח של ריטה אינו זמין');
    const text=await generateBrokerRitaScript(context,aiKey);
    const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:IVR_MODEL_ID,voice_settings:IVR_VOICE_SETTINGS}),signal:AbortSignal.timeout(30_000)});
    if(!response.ok){const body=await response.text();console.error('[broker-outreach-voice]',response.status,body.slice(0,2000));throw new Error(`ElevenLabs דחה יצירת הקלטה (${response.status})`);}
    const reader=response.body?.getReader();if(!reader)throw new Error('הספק לא החזיר הקלטה');
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>5*1024*1024){await reader.cancel();throw new Error('ההקלטה גדולה מדי');}chunks.push(part.value);}
    const audio=new Uint8Array(length);let offset=0;for(const part of chunks){audio.set(part,offset);offset+=part.byteLength;}
    const path=`${j.created_by}/broker-outreach/${brokerId}/${crypto.randomUUID()}.mp3`;
    const {error:uploadError}=await admin.storage.from('ivr-audio').upload(path,audio,{contentType:'audio/mpeg'});if(uploadError)throw uploadError;
    const {data:signed,error:signError}=await admin.storage.from('ivr-audio').createSignedUrl(path,300);if(signError||!signed?.signedUrl)throw signError??new Error('ההקלטה אינה זמינה');
    const {data:latest,error:latestError}=await admin.from('broker_outreach_journeys').select('enabled,opted_out_at').eq('broker_id',brokerId).single();if(latestError)throw latestError;
    if(!latest.enabled||latest.opted_out_at)return;
    const {error:stateError}=await admin.from('broker_outreach_journeys').update({voice_status:'sending'}).eq('broker_id',brokerId);if(stateError)throw stateError;
    let messageId:string;
    if(emailReply){
      if(!p.email||p.email.endsWith('.invalid'))throw new Error('אין כתובת מייל תקינה לשליחת ההקלטה');
      const gatewayKey=process.env['LOVABLE_API_KEY'];const resendKey=process.env['RESEND_API_KEY'];
      if(!gatewayKey||!resendKey)throw new Error('חיבור המייל אינו זמין');
      let binary='';for(const value of audio)binary+=String.fromCharCode(value);
      const response=await fetch('https://connector-gateway.lovable.dev/resend/emails',{method:'POST',headers:{Authorization:`Bearer ${gatewayKey}`,'X-Connection-Api-Key':resendKey,'Content-Type':'application/json'},body:JSON.stringify({from:`TORAFF <${process.env['RESEND_FROM_EMAIL']??'join@toraff.co.il'}>`,to:[p.email],subject:'הסבר קצר מריטה על TORAFF',text:`תודה על ההתעניינות. מצורפת הודעה קולית קצרה מריטה.${loginLink?`\n\nכניסה לחשבון האישי שלך:\n${loginLink}`:''}\n\nאפשר להשיב בכל שאלה, או להשיב ״הסרה״ כדי שלא לקבל הודעות המשך.`,attachments:[{filename:'rita-toraff.mp3',content:btoa(binary)}]}),signal:AbortSignal.timeout(15_000)});
      const raw=await response.text();if(!response.ok){console.error('[broker-outreach-email-audio]',response.status,raw.slice(0,1000));throw new Error(`שליחת ההקלטה במייל נכשלה (${response.status})`);}
      const body=JSON.parse(raw) as {id?:string};if(!body.id)throw new Error('המייל לא החזיר מזהה הודעה');messageId=body.id;
    }else{
      if(!contact?.whatsapp_phone)throw new Error('לא נשמר מספר וואטסאפ אישי');
      messageId=await officialOutreachSend(admin,j.created_by,{phone_number:contact.whatsapp_phone,audio_url:signed.signedUrl});
      if(loginLink){try{await officialOutreachSend(admin,j.created_by,{phone_number:contact.whatsapp_phone,message:`תודה על ההתעניינות! כאן אפשר להיכנס לחשבון האישי שלך ב-TORAFF:\n${loginLink}\n\nלהסרה מהודעות המשך אפשר להשיב ״הסרה״.`});}catch(linkError){console.error('[broker-outreach-link]',linkError instanceof Error?linkError.message:linkError);}}
    }
    const {error:saveError}=await admin.from('broker_outreach_journeys').update({voice_status:'accepted',voice_message_id:messageId,last_error:null}).eq('broker_id',brokerId);if(saveError)throw saveError;
    await outreachEvent(admin,brokerId,'voice_accepted',{message_id:messageId});
  } catch(error){
    const reason=error instanceof Error?error.message:'יצירת ההודעה הקולית נכשלה';
    // An ambiguous send is never retried automatically.
    const {error:e}=await admin.from('broker_outreach_journeys').update({voice_status:'needs_review',last_error:reason}).eq('broker_id',brokerId);if(e)console.error('[broker-outreach-state]',e.message);
    await outreachEvent(admin,brokerId,'voice_failed',{reason});
  }
}