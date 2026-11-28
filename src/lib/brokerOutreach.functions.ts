import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { outreachReply } from './brokerOutreachPolicy';

const brokerInput=z.object({brokerId:z.string().uuid()});
export const configureBrokerOutreach=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({brokerId:z.string().uuid(),enabled:z.boolean(),messageConsent:z.boolean(),callConsent:z.boolean(),note:z.string().max(500)}).parse(input)).handler(async({data,context})=>{
  const {error}=await context.supabase.rpc('configure_broker_outreach',{_broker:data.brokerId,_enabled:data.enabled,_message_consent:data.messageConsent,_call_consent:data.callConsent,_note:data.note});
  if(error)throw new Error('שמירת המסלול נכשלה; נדרש מתווך מיובא ותיעוד הסכמה');
  if(!data.enabled||!data.callConsent){
    const {data:j,error:je}=await context.supabase.from('broker_outreach_journeys').select('call_provider_id,call_due_at,call_status').eq('broker_id',data.brokerId).single();if(je)throw je;
    if(j.call_due_at&&Date.parse(j.call_due_at)>Date.now()&&['pending','ready_to_schedule','scheduling'].includes(j.call_status)){
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const {cancelBrokerDemo}=await import('./brokerOutreach.server');
      return cancelBrokerDemo(supabaseAdmin,data.brokerId);
    }
  }
  return {cancelled:false,pending:false};
});
export const getBrokerOutreach=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>brokerInput.parse(input)).handler(async({data,context})=>{
  const {data:role,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'super_admin'});
  if(roleError||!role)throw new Error('גישה למנהל בלבד');
  const [{data:journey,error:je},{data:events,error:ee},{data:profile,error:pe},{data:property,error:le}]=await Promise.all([
    context.supabase.from('broker_outreach_journeys').select('*').eq('broker_id',data.brokerId).maybeSingle(),
    context.supabase.from('broker_outreach_events').select('id,kind,detail,created_at').eq('broker_id',data.brokerId).order('created_at',{ascending:false}).limit(25),
    context.supabase.from('profiles').select('id,full_name,phone,gender').eq('id',data.brokerId).single(),
    context.supabase.from('listings').select('id,address,city,source_url').eq('workspace_owner_id',data.brokerId).eq('source','yad2').not('address','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(je||ee||pe||le)throw new Error('טעינת מסלול הפנייה נכשלה');
  return {journey,events:events??[],profile,property};
});

export const cancelBrokerOutreachCall=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>brokerInput.parse(input)).handler(async({data,context})=>{
  const {data:role,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'super_admin'});
  const {data:demo,error:de}=await context.supabase.from('demo_view_accounts').select('user_id').eq('user_id',context.userId).maybeSingle();
  if(error||de||!role||demo)throw new Error('פעולה למנהל בלבד, ללא מצב הדגמה');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {cancelBrokerDemo}=await import('./brokerOutreach.server');
  return cancelBrokerDemo(supabaseAdmin,data.brokerId);
});

export const completeBrokerOutreachLogin=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:journey,error}=await supabaseAdmin.rpc('activate_broker_outreach_login',{_broker:context.userId});
  if(error)throw new Error('רישום הכניסה למסלול הפנייה נכשל');
  if(!journey){
    // Recover only an existing, not-yet-submitted schedule; never repeat a provider request of uncertain outcome.
    const {data:pending,error:pe}=await supabaseAdmin.from('broker_outreach_journeys').select('call_status,call_due_at').eq('broker_id',context.userId).maybeSingle();
    if(pe)throw pe;
    if(pending?.call_status==='ready_to_schedule'&&pending.call_due_at&&Date.parse(pending.call_due_at)>Date.now()){
      const {scheduleBrokerDemo}=await import('./brokerOutreach.server');await scheduleBrokerDemo(supabaseAdmin,context.userId);
    }
    return {activated:false};
  }
  const {scheduleBrokerDemo,officialOutreachSend,outreachEvent}=await import('./brokerOutreach.server');
  await scheduleBrokerDemo(supabaseAdmin,context.userId);
  // Persisted in-app alerts are transactional with activation. WhatsApp failures remain separate and visible.
  const {data:roles,error:re}=await supabaseAdmin.from('user_roles').select('user_id').eq('role','super_admin');
  if(re)throw re;
  const {data:profile}=await supabaseAdmin.from('profiles').select('full_name').eq('id',context.userId).single();
  for(const admin of roles??[]) {
    try {
      const {data:p,error:pe}=await supabaseAdmin.from('profiles').select('phone').eq('id',admin.user_id).single();if(pe)throw pe;
      const messageId=await officialOutreachSend(supabaseAdmin,admin.user_id,{phone_number:p.phone,message:`${profile?.full_name??'מתווך'} נכנס לחשבון בפעם הראשונה. לניהול שיחת ההדגמה: https://toraff.co.il/super-admin/broker/${context.userId}`});
      await outreachEvent(supabaseAdmin,context.userId,'admin_whatsapp_accepted',{recipient:admin.user_id,message_id:messageId});
    }catch(e){await outreachEvent(supabaseAdmin,context.userId,'admin_whatsapp_failed',{recipient:admin.user_id,reason:e instanceof Error?e.message:'שליחת ההתראה נכשלה'});}
  }
  return {activated:true};
});

/** Only called by a verified provider handoff; no browser-callable RPC. */
export const handleBrokerOutreachReply=createServerOnlyFn(async(input:{phone:string;messageId:string;replyTo:string|null;text:string})=>{
  const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
  const {data:contacts,error:ce}=await admin.from('broker_whatsapp_contacts').select('broker_id,workspace_owner_id').eq('whatsapp_phone',input.phone);
  if(ce)throw ce;if(contacts?.length!==1)return {handled:false};
  const contact=contacts[0];if(!contact||contact.broker_id!==contact.workspace_owner_id)return {handled:false};
  const {data:j,error:je}=await admin.from('broker_outreach_journeys').select('*').eq('broker_id',contact.broker_id).maybeSingle();
  if(je)throw je;
  if(!j?.enabled||j.outreach_channel!=='whatsapp'||!j.outreach_message_id||j.opted_out_at)return {handled:false};
  if(input.replyTo&&input.replyTo!==j.outreach_message_id)return {handled:false};
  const kind=outreachReply(input.text);
  if(kind==='unknown')return {handled:false};
  const {data:saved,error:ue}=await admin.rpc('record_broker_outreach_reply',{_broker:j.broker_id,_message:input.messageId,_kind:kind,_text:input.text,_reply_to:input.replyTo??j.outreach_message_id});
  if(ue)throw ue;if(!saved)return {handled:false};
  if(kind==='positive'){
    const {sendBrokerVoice}=await import('./brokerOutreach.server');
    try{await sendBrokerVoice(admin,j.broker_id);}catch(error){
      const reason=error instanceof Error?error.message:'יצירת ההודעה הקולית לא הושלמה';
      const {error:se}=await admin.from('broker_outreach_journeys').update({last_error:reason}).eq('broker_id',j.broker_id);if(se)throw se;
      throw error;
    }
  }else if(j.call_due_at&&Date.parse(j.call_due_at)>Date.now()){
    const {cancelBrokerDemo}=await import('./brokerOutreach.server');
    await cancelBrokerDemo(admin,j.broker_id);
  }
  return {handled:true};
});

export const handleBrokerOutreachEmailReply=createServerOnlyFn(async(input:{email:string;messageId:string;text:string})=>{
  const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
  const {data:profiles,error:pe}=await admin.from('profiles').select('id').eq('email',input.email.toLowerCase()).limit(2);if(pe)throw pe;if(profiles?.length!==1)return {handled:false};
  const profile=profiles[0];if(!profile)return {handled:false};
  const {data:j,error:je}=await admin.from('broker_outreach_journeys').select('*').eq('broker_id',profile.id).eq('outreach_channel','email').maybeSingle();if(je)throw je;
  if(!j?.enabled||j.opted_out_at||!j.outreach_message_id)return {handled:false};
  const kind=outreachReply(input.text);if(kind==='unknown')return {handled:false};
  const {data:saved,error:re}=await admin.rpc('record_broker_outreach_reply',{_broker:j.broker_id,_message:`email:${input.messageId}`,_kind:kind,_text:input.text,_reply_to:j.outreach_message_id});if(re)throw re;if(!saved)return {handled:false};
  const {sendBrokerVoice,cancelBrokerDemo}=await import('./brokerOutreach.server');
  if(kind==='positive')await sendBrokerVoice(admin,j.broker_id);
  else if(j.call_due_at&&Date.parse(j.call_due_at)>Date.now())await cancelBrokerDemo(admin,j.broker_id);
  return {handled:true};
});