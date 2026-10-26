import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { decryptSession } from '../_shared/sessionCrypto.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const secret = Deno.env.get('CLOUD_WORKER_SHARED_SECRET') ?? '';
const worker = Deno.env.get('CLOUD_BROWSER_WORKER_URL') ?? '';
const enc = Deno.env.get('FB_SESSION_ENC_KEY') ?? '';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tick') }),
  z.object({ action: z.literal('dispatch'), job_id: z.string().uuid(), dispatch_token: z.string().uuid() }),
  z.object({ action: z.literal('retry'), group_ids: z.array(z.string().uuid()).min(1).max(200) }),
  z.object({ action: z.literal('join_result'), job_id: z.string().uuid(), dispatch_token: z.string().uuid(), outcome: z.enum(['joined','requested','needs_answers','failed','session_expired']), requirements: z.array(z.string().max(2000)).max(20).optional(), error: z.string().max(1000).optional() }),
]);
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' },405);
  let raw; try { raw = await req.json(); } catch { return json({error:'invalid_json'},400); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({error:'invalid_input'},400);
  const body = parsed.data;
  const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',{auth:{persistSession:false}});
  if (body.action === 'tick') {
    if(!secret || req.headers.get('x-worker-secret') !== secret) return json({error:'unauthorized'},401);
    await db.from('fb_group_join_jobs').update({status:'queued',dispatch_token:crypto.randomUUID(),claim_expires_at:null}).eq('status','processing').lt('claim_expires_at',new Date().toISOString());
    const {data:due} = await db.from('fb_group_join_jobs').select('id,dispatch_token,workspace_owner_id').in('status',['queued','requested']).lte('available_at',new Date().toISOString()).order('available_at').limit(30);
    const seen = new Set<string>();
    for(const j of due ?? []) { if(seen.has(j.workspace_owner_id)) continue; seen.add(j.workspace_owner_id); await fetch(`${url}/functions/v1/fb-group-manager`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dispatch',job_id:j.id,dispatch_token:j.dispatch_token})}); }
    return json({success:true});
  }
  if (body.action === 'retry') {
    const auth = req.headers.get('Authorization') ?? '';
    const scoped = createClient(url,Deno.env.get('SUPABASE_ANON_KEY') ?? '',{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:u,error:authError} = await scoped.auth.getUser();
    if(authError || !u.user) return json({error:'unauthorized'},401);
    const {data:owner} = await scoped.rpc('current_workspace_owner');
    const {data:allowed} = await scoped.rpc('ws_current_access',{_ws:owner});
    if (!owner || !allowed) return json({error:'forbidden'},403);
    const {data:groups,error} = await db.from('fb_user_groups').select('id').eq('workspace_owner_id',owner).eq('is_blocked',false).neq('join_status','joined').in('id',body.group_ids);
    if(error) return json({error:'read_failed'},500);
    let queued = 0;
    for(const g of groups ?? []) {
      const {data:j} = await db.from('fb_group_join_jobs').select('*').eq('group_row_id',g.id).maybeSingle();
      if(j?.status === 'processing') continue;
      const {data:job,error:saveError} = await db.from('fb_group_join_jobs').upsert({group_row_id:g.id,workspace_owner_id:owner,status:'queued',dispatch_token:crypto.randomUUID(),available_at:new Date().toISOString()}, {onConflict:'group_row_id'}).select('*').single();
      if(saveError || !job) continue;
      await db.from('fb_user_groups').update({cloud_join_state:'queued',waiting_reason:null}).eq('id',g.id).eq('workspace_owner_id',owner);
      await fetch(`${url}/functions/v1/fb-group-manager`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dispatch',job_id:job.id,dispatch_token:job.dispatch_token})});
      queued++;
    }
    return json({success:true,queued});
  }
  if(body.action==='join_result' && (!secret || req.headers.get('x-worker-secret') !== secret)) return json({error:'unauthorized'},401);
  const {data:job,error:jobError} = await db.from('fb_group_join_jobs').select('*').eq('id',body.job_id).eq('dispatch_token',body.dispatch_token).maybeSingle();
  if(jobError || !job) return json({error:'invalid_job'},403);
  if(body.action==='join_result') {
    if(job.status!=='processing') return json({success:true,updated:false});
    const now = new Date().toISOString();
    const {data:claimed,error} = await db.from('fb_group_join_jobs').update({status:body.outcome,available_at:new Date(Date.now()+60*60_000).toISOString(),claim_expires_at:null,last_error:body.error ?? null,updated_at:now}).eq('id',job.id).eq('status','processing').eq('dispatch_token',body.dispatch_token).select('id').maybeSingle();
    if(error) return json({error:'report_failed'},500);
    if(!claimed) return json({success:true,updated:false});
    const {error:groupError} = await db.from('fb_user_groups').update({join_status:body.outcome==='joined'?'joined':body.outcome==='requested'?'pending':'not_joined',cloud_join_state:body.outcome,cloud_checked_at:now,membership_requirements:body.requirements ?? [],waiting_reason:body.error ?? (body.outcome==='needs_answers'?'נדרשות תשובות והסכמה לכללי הקבוצה':null)}).eq('id',job.group_row_id).eq('workspace_owner_id',job.workspace_owner_id).eq('is_blocked',false);
    if(groupError) return json({error:'group_update_failed'},500);
    if(body.outcome==='session_expired') await db.from('fb_cloud_sessions').update({status:'expired',last_error:'Facebook requires sign-in',last_verified_at:now}).eq('workspace_owner_id',job.workspace_owner_id);
    await db.rpc('fb_rebalance_group_pool',{_owner:job.workspace_owner_id});
    const {data:next} = await db.from('fb_group_join_jobs').select('id,dispatch_token').eq('workspace_owner_id',job.workspace_owner_id).eq('status','queued').order('created_at').limit(1).maybeSingle();
    if(next) await fetch(`${url}/functions/v1/fb-group-manager`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dispatch',job_id:next.id,dispatch_token:next.dispatch_token})});
    return json({success:true});
  }
  if(!['queued','requested'].includes(job.status)) return json({success:true,dispatched:false});
  const {data:g} = await db.from('fb_user_groups').select('*').eq('id',job.group_row_id).eq('workspace_owner_id',job.workspace_owner_id).maybeSingle();
  if(!g || g.is_blocked || g.pool_status==='overflow') return json({error:'group_unavailable'},409);
  const {data:s} = await db.from('fb_cloud_sessions').select('cookies_encrypted,user_agent,status,expires_at').eq('workspace_owner_id',job.workspace_owner_id).maybeSingle();
  if(!worker || !secret || !enc || !s?.cookies_encrypted || s.status!=='active' || (s.expires_at && Date.parse(s.expires_at)<Date.now())) {
    await db.from('fb_group_join_jobs').update({last_error:'נדרש חיבור פייסבוק פעיל'}).eq('id',job.id);
    await db.from('fb_user_groups').update({cloud_join_state:'queued',waiting_reason:'נדרש חיבור פייסבוק פעיל'}).eq('id',g.id).eq('workspace_owner_id',job.workspace_owner_id);
    return json({error:'cloud_unavailable'},409);
  }
  const {data:claimed} = await db.rpc('fb_claim_group_join',{_job:job.id,_token:body.dispatch_token});
  if(!claimed) return json({success:true,dispatched:false});
  try {
    const capabilityResponse = await fetch(new URL('/capabilities',worker),{signal:AbortSignal.timeout(5000),redirect:'error'});
    const capabilities = await capabilityResponse.json();
    if(!capabilityResponse.ok || capabilities.group_join !== true) throw new Error('worker_join_not_deployed');
    const cookies = await decryptSession(s.cookies_encrypted,enc);
    await db.from('fb_user_groups').update({cloud_join_state:'processing',waiting_reason:null}).eq('id',g.id).eq('workspace_owner_id',job.workspace_owner_id);
    const response = await fetch(worker,{method:'POST',headers:{'Content-Type':'application/json','x-worker-secret':secret},signal:AbortSignal.timeout(20_000),redirect:'error',body:JSON.stringify({job_type:'group_join',job_id:job.id,dispatch_token:job.dispatch_token,workspace_owner_id:job.workspace_owner_id,group_url:g.group_url,session_cookies:cookies,user_agent:s.user_agent,membership_answers:g.membership_answers,rules_accepted:g.rules_accepted,report_url:`${url}/functions/v1/fb-group-manager`})});
    const ack = await response.json();
    if(response.status!==202 || ack?.accepted!==true) throw new Error('invalid_worker_ack');
    return json({success:true,dispatched:true});
  } catch {
    await db.from('fb_group_join_jobs').update({status:'failed',claim_expires_at:null,last_error:'שירות ההצטרפות לקבוצות אינו זמין'}).eq('id',job.id).eq('status','processing');
    await db.from('fb_user_groups').update({cloud_join_state:'failed',waiting_reason:'שירות ההצטרפות לקבוצות אינו זמין'}).eq('id',g.id).eq('workspace_owner_id',job.workspace_owner_id);
    return json({error:'dispatch_failed'},502);
  }
});