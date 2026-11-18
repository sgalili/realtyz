import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { collectBrokers, nextImportPoint, freshImportCheckpoint, advanceSearchPoint, skipRestrictedImport } from '../_shared/brokerImportQueue.ts';
import { readWorkerResponse, ImportAvailabilityError, ProviderTimeoutError } from '../_shared/brightDataDiagnostics.ts';
import { agencyPageUrl, agencyUrl, agencyRegistryKey, agencyVolumeAllowed, recentAgencyCheck } from '../_shared/yad2Agencies.ts';
import { PROVIDER_GAP_MS, ProviderRateLimitError, rateCooldownRemaining } from '../_shared/brightDataThrottle.ts';
import { developerImportUrl, developerProjectImportRow, developerQueuePhaseAfterPage, detailedUnitCount, mergeDeveloperQueuePage, newDeveloperQueueWork, type DeveloperQueueWork } from '../_shared/yad2DeveloperImport.ts';
import { autonomousDeveloperCheckpoint, DEVELOPER_TRANSIENT_RETRY, developerRetryDeadline } from '../_shared/developerImportRetry.ts';

const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('start'),target_brokers:z.number().int().min(1).max(100),min_listings:z.number().int().min(1).max(10),max_listings:z.number().int().min(1).max(10)}).strict(),
  z.object({action:z.literal('start_urls'),urls:z.array(z.string().max(500)).min(1).max(100),max_listings:z.number().int().min(1).max(10).optional(),expected_projects:z.number().int().min(1).max(100).optional(),max_projects:z.number().int().min(1).max(100).optional()}).strict(),
  z.object({action:z.enum(['pause','resume','reset_cooldown','step']),job_id:z.string().uuid()}).strict(),
]);
const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
// Search pages rarely carry phone/license, so unknown publishers are opened one by one, within a per-job budget.
const ENRICH_BUDGET = 150;
const compactDirectoryRows=(rs:Record<string,any>[])=>rs.map(r=>({source_url:r.source_url,active_listing_count:r.active_listing_count,owner_name:r.owner_name,owner_phone:r.owner_phone,owner_email:r.owner_email,listing_urls:r.listing_urls,publisher:r.publisher}));
// Scrape cache: search pages stay fresh 12h, ad details 72h. Freshness is never extended on read.
const CACHE_TTL_MS = { search_page: 12 * 3600_000, item_detail: 72 * 3600_000 } as const;
type CacheKind = keyof typeof CACHE_TTL_MS;
async function cached(admin: ReturnType<typeof adminClient>, kind: CacheKind, key: string, c: Record<string, any>, fetcher: () => Promise<Record<string, any>[]>) {
  const { data } = await admin.from('broker_import_scrape_cache').select('results,fetched_at,hits').eq('cache_key', key).maybeSingle();
  if (!(kind === 'search_page' && c.freshSearch) && data && Date.now() - Date.parse(data.fetched_at) < CACHE_TTL_MS[kind] && Array.isArray(data.results)) {
    c.cacheHits = (c.cacheHits ?? 0) + 1;
    await admin.from('broker_import_scrape_cache').update({ hits: (data.hits ?? 0) + 1 }).eq('cache_key', key);
    return data.results as Record<string, any>[];
  }
  const results = await fetcher();
  c.liveFetches = (c.liveFetches ?? 0) + 1;
  await admin.from('broker_import_scrape_cache').delete().lt('fetched_at', new Date(Date.now() - 7 * 86400_000).toISOString());
  if (results.length) await admin.from('broker_import_scrape_cache').upsert({ cache_key: key, kind, results, fetched_at: new Date().toISOString(), hits: 0 });
  return results;
}
async function call(name: string, body: unknown) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return readWorkerResponse(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  const caller=await requireCaller(req,['user','service','cron']); if(caller instanceof Response) return caller;
  const parsed=schema.safeParse(await req.json().catch(()=>null)); if(!parsed.success) return json({error:'invalid_input'},400);
  const input=parsed.data; const admin=adminClient();
  if(input.action!=='step' && (caller.kind!=='user' || !await isSuperAdmin(caller.userId,admin))) return json({error:'forbidden'},403);
  if(input.action==='step' && caller.kind==='user' && !await isSuperAdmin(caller.userId,admin)) return json({error:'forbidden'},403);
  try {
    if(input.action==='start') {
      if(caller.kind!=='user' || input.max_listings<input.min_listings) return json({error:'טווח נכסים לא תקין'},400);
      const {data,error}=await admin.rpc('start_fresh_broker_import_job',{_actor:caller.userId,_target:input.target_brokers,_min:input.min_listings,_max:input.max_listings,_checkpoint:freshImportCheckpoint()});
      if(error) throw new Error(error.code==='23505'?'כבר קיים ייבוא פעיל':error.message);
      return json({job_id:data});
    }
    if(input.action==='start_urls') {
      if(caller.kind!=='user') return json({error:'forbidden'},403);
      const developerUrls=[...new Set(input.urls.map(u=>developerImportUrl(u.trim())).filter((u):u is string=>Boolean(u)))];
      const brokerUrls=[...new Set(input.urls.filter(u=>!developerImportUrl(u.trim())).map(u=>agencyUrl(u.trim())).filter((u):u is string=>Boolean(u)))];
      const accepted=developerUrls.length+brokerUrls.length;
      if(!accepted) return json({error:'לא נמצאו קישורי משרד/מתווך או יזם תקינים של יד2'},400);
      const checkpoint={...freshImportCheckpoint(),source:'urls',phase:developerUrls.length?'developer_scanning':'enriching',enrichUrls:brokerUrls,developerUrls,developerIndex:0,developerResults:[],expectedProjects:input.expected_projects??1,maxProjects:input.max_projects??null,totalBrokerUrls:brokerUrls.length,totalDeveloperUrls:developerUrls.length,enriched:0,invalidUrls:input.urls.length-accepted};
      const {data,error}=await admin.rpc('start_fresh_broker_import_job',{_actor:caller.userId,_target:accepted,_min:1,_max:input.max_listings??10,_checkpoint:checkpoint});
      if(error) throw new Error(error.code==='23505'?'כבר קיים ייבוא פעיל':error.message);
      return json({job_id:data,accepted,developers:developerUrls.length,brokers:brokerUrls.length,rejected:input.urls.length-accepted});
    }
    const {data:existing,error:readError}=await admin.from('broker_import_jobs').select('*').eq('id',input.job_id).single();
    if(readError || !existing || !await isSuperAdmin(existing.created_by,admin)) return json({error:'job_unavailable'},404);
    if(input.action==='pause'||input.action==='reset_cooldown') {
      if(existing.status==='completed') return json({ok:true});
      const scoped=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:req.headers.get('Authorization')??''}}});
      const {error}=await scoped.rpc('control_broker_import_job',{_id:input.job_id,_action:input.action}); if(error) throw error;
      return json({ok:true});
    }
    if(input.action==='resume') {
      if(existing.status==='completed') return json({error:'הייבוא הסתיים'},400);
      const cooldown=rateCooldownRemaining(existing.checkpoint as Record<string,unknown>);
      if(cooldown>0)return json({error:`השהיית בטיחות לאחר 429. ניתן להמשיך בעוד ${Math.ceil(cooldown/1000)} שניות.`},429);
      const scoped=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:req.headers.get('Authorization')??''}}});
      const {error}=await scoped.rpc('control_broker_import_job',{_id:input.job_id,_action:'resume'}); if(error) throw error;
      return json({ok:true});
    }
    const {data:claimed,error:claimError}=await admin.rpc('claim_broker_import_step',{_id:input.job_id}); if(claimError) throw claimError;
    const job=claimed?.[0]; if(!job) return json({ok:true,idle:true});
    const c=job.checkpoint as Record<string,any>; const started=Date.now();
    const autonomousDeveloper=()=>autonomousDeveloperCheckpoint(c);
    const criteriaKey=`volume:${job.min_listings}:${job.max_listings}`;
    const recentKeys=async(rows:Record<string,any>[])=>{
      const keys=[...new Set(rows.map(agencyRegistryKey).filter((key):key is string=>Boolean(key)))];
      if(!keys.length)return new Set<string>();
      const {data,error}=await admin.from('broker_import_agency_registry').select('agency_key,checked_at').eq('criteria_key',criteriaKey).in('agency_key',keys).gt('checked_at',new Date(Date.now()-7*86400_000).toISOString());
      if(error)throw error;
      return new Set((data??[]).filter(r=>recentAgencyCheck(r.checked_at)).map(r=>r.agency_key));
    };
    const recordCheck=async(row:Record<string,any>,outcome:'checked'|'disqualified',reason:string)=>{
      const key=agencyRegistryKey(row);if(!key)return;
      const {error}=await admin.from('broker_import_agency_registry').upsert({agency_key:key,criteria_key:criteriaKey,outcome,reason,listing_count:row.active_listing_count??null,checked_at:new Date().toISOString()});
      if(error)throw error;
    };
    if (c.source !== 'urls' && ['scanning','enriching'].includes(c.phase) && (c.source !== 'agencies' || c.discoveryVersion !== 2)) {
      Object.assign(c, freshImportCheckpoint()); delete c.deal; delete c.enrichUrls; delete c.enriched;
      delete c.directoryNextUrl; delete c.directoryPages; delete c.directoryExhausted;
    }
    const save=async (patch:Record<string,unknown>={})=> {
      const duration=Date.now()-started;
      const {error}=await admin.from('broker_import_jobs').update({checkpoint:c,stage:c.phase,lease_token:null,lease_until:null,step_average_ms:job.step_average_ms?Number(job.step_average_ms)*0.7+duration*0.3:duration,updated_at:new Date().toISOString(),...patch}).eq('id',job.id).eq('lease_token',job.lease_token);
      if(error) throw error;
    };
    const pacedCall=async (name:string,body:unknown)=> {
      // Cache reads never reach this function; each live chunk has its own lease.
      // Pasted-link imports run in instant mode: no safety gap between requests (429 handling still applies).
      const instant=c.source==='urls';
      const wait=instant?0:Math.max(0,Number(c.nextRequestAt??0)-Date.now());
      if(wait>0) {
        c.waitUntil=Date.now()+wait;c.waitReason='throttle';
        await admin.from('broker_import_jobs').update({checkpoint:c,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token);
        // Delay-only step preserves the 120s fetch budget and makes stop immediate.
        await new Promise(resolve=>setTimeout(resolve,Math.min(wait,PROVIDER_GAP_MS)));
        await save();return null;
      }
      const {data:state}=await admin.from('broker_import_jobs').select('status,lease_token').eq('id',job.id).single();
      if(state?.status!=='running'||state.lease_token!==job.lease_token)throw new Error('הייבוא הושהה לפני הבקשה הבאה');
      delete c.waitUntil;delete c.waitReason;delete c.waitScope;
      try {
        const result=await call(name,body);
        if(autonomousDeveloper()){c.rateRetries=0;c.transientRetries=0;}
        return result;
      } finally {if(instant){delete c.nextRequestAt;}else c.nextRequestAt=Date.now()+PROVIDER_GAP_MS;}
    };
    try {
      if(c.waitReason==='rate_limit' || c.waitReason===DEVELOPER_TRANSIENT_RETRY) {
        if(autonomousDeveloper()) {
          const remaining=Math.max(0,Number(c.waitUntil??0)-Date.now());
          if(remaining>0) {
            // The database trigger arms a one-off delayed wake-up; do not spin or require Continue.
            await save({status:'running',error:null});
            return json({ok:true,waiting:true,retry_in_ms:remaining});
          }
          delete c.waitReason;delete c.waitUntil;delete c.waitScope;
        } else {
          // Broker imports retain their explicit manual cooldown/resume policy.
          await save({status:'paused',error:'מגבלת בקשות (429). הייבוא מושהה; ההתקדמות והמטמון נשמרו. יש להמשיך ידנית לאחר השהיית הבטיחות.'});
          return json({ok:true,paused:true});
        }
      }
      if(c.phase==='developer_scanning') {
        const url=c.developerUrls?.[c.developerIndex??0];
        if(!url) {
          c.phase=c.enrichUrls?.length?'enriching':c.brokers?.length?'validating':'completed';
          await save(c.phase==='completed'?{status:'completed'}:{});return json({ok:true});
        }
        const work=(c.developerWork??newDeveloperQueueWork(url,Number(c.expectedProjects??1),c.maxProjects?Number(c.maxProjects):undefined)) as DeveloperQueueWork;
        c.developerWork=work;
        const pageUrl=work.pendingUrls[0];
        if(!pageUrl) {c.phase=work.accountId?'developer_saving':'developer_creating';await save();return json({ok:true});}
        const d=await pacedCall('yad2-developer-import',{url:pageUrl,parent_project:work.inventoryParents?.[pageUrl],page_only:true,admin_import_job_id:job.id,admin_import_lease_token:job.lease_token});
        if(!d)return json({ok:true,waiting:true});
        if(!d.ok||!d.developer||!Array.isArray(d.projects)||!Array.isArray(d.links))throw new Error('עמוד היזם לא החזיר מבנה תקין');
        mergeDeveloperQueuePage(work,{source_url:pageUrl,developer:d.developer,projects:d.projects,links:d.links,inventoryPages:d.inventoryPages});
        // Some rendered profile pages expose the company only on their project pages.
        // Keep scanning instead of failing before those own pages have been read.
        c.phase=developerQueuePhaseAfterPage(work);
        await save();return json({ok:true});
      }
      if(c.phase==='developer_creating') {
        const work=c.developerWork as DeveloperQueueWork;
        const companyName=work.developer.company_name?.trim();
        if(!companyName)throw new Error('לא נמצא שם חברה בעמוד היזם; לא נוצר חשבון ללא זהות');
        let {data:matches,error:matchError}=await admin.from('developers').select('*').eq('source_url',work.url).limit(2);if(matchError)throw matchError;
        if(!matches?.length) {
          // A direct project link reuses the developer that already owns that exact project page (query string ignored).
          const projectPath=work.url.split('?')[0].replace(/\/$/,'');
          const {data:owned,error:ownedError}=await admin.from('developer_projects').select('developer_id').or(`source_url.eq.${projectPath},source_url.like.${projectPath}?*`).limit(20);if(ownedError)throw ownedError;
          const ids=[...new Set((owned??[]).map(r=>r.developer_id))];
          if(ids.length>1)throw new Error('הפרויקט משויך ליותר מיזם אחד; נדרשת בדיקת מנהל');
          if(ids.length){const r=await admin.from('developers').select('*').eq('id',ids[0]).limit(1);if(r.error)throw r.error;matches=r.data;}
        }
        if(!matches?.length) {
          // A profile link reuses the single developer that already owns any of the scanned Yad2 projects, then an exact unique company name. Why: no duplicate developer accounts.
          const sourceIds=[...new Set(work.projects.map((p:any)=>p.source_project_id).filter(Boolean).map(String))];
          if(sourceIds.length){const {data:owned,error}=await admin.from('developer_projects').select('developer_id').in('source_project_id',sourceIds).limit(50);if(error)throw error;
            const ids=[...new Set((owned??[]).map(r=>r.developer_id))];
            if(ids.length>1)throw new Error('פרויקטי היזם משויכים ליותר מחשבון אחד; נדרשת בדיקת מנהל');
            if(ids.length){const r=await admin.from('developers').select('*').eq('id',ids[0]).limit(1);if(r.error)throw r.error;matches=r.data;}}
          if(!matches?.length){const r=await admin.from('developers').select('*').eq('company_name',companyName).limit(2);if(r.error)throw r.error;if((r.data?.length??0)===1)matches=r.data;}
        }
        if((matches?.length??0)>1)throw new Error('קיים יותר מחשבון אחד המקושר לעמוד היזם; נדרשת בדיקת מנהל');
        const existing=matches?.[0];
        let accountId=existing?.workspace_owner_id as string|undefined;
        if(!accountId) {
          const d=await call('super-admin-create-user',{full_name:companyName,...(work.developer.phone?{phone_e164:work.developer.phone}:{}),user_type:'developer',import_job_id:job.id,import_source_url:work.url,initial_balance_agorot:2500});
          if(!d.user_id)throw new Error(d.error??'יצירת היזם נכשלה');
          accountId=d.user_id;
        }
        let developerId=existing?.id as string|undefined;
        const companyRow={workspace_owner_id:accountId,owner_user_id:existing?.owner_user_id??accountId,company_name:companyName,phone:work.developer.phone??existing?.phone??null,logo_url:work.developer.logo_url??existing?.logo_url??null,source_url:existing?.source_url??work.url,last_synced_at:new Date().toISOString()};
        if(developerId){const {error}=await admin.from('developers').update(companyRow).eq('id',developerId);if(error)throw error;}
        else {const {data,error}=await admin.from('developers').insert(companyRow).select('id').single();if(error)throw error;developerId=data.id;}
        if(work.developer.bio){const {error}=await admin.from('profiles').update({imported_public_bio:work.developer.bio}).eq('id',accountId).is('imported_public_bio',null);if(error)throw error;}
        work.accountId=accountId;work.developerId=developerId;c.phase='developer_saving';await save();return json({ok:true});
      }
      if(c.phase==='developer_saving') {
        const work=c.developerWork as DeveloperQueueWork;
        if(!work.accountId||!work.developerId)throw new Error('חשבון היזם לא נשמר; אפשר להמשיך מאותה נקודה');
        const dirty=work.projects.filter(project=>work.dirtyProjectKeys.includes(String(project.source_project_id??project.source_url??project.name)));
        if(dirty.length) {
          const {data:existingProjects,error:readError}=await admin.from('developer_projects').select('*').eq('developer_id',work.developerId);if(readError)throw readError;
          const rows=dirty.map(project=>{
            const old=(existingProjects??[]).find(row=>row.source_project_id===(project.source_project_id??project.source_url??project.name)||!!project.source_url&&row.source_url===project.source_url);
            return developerProjectImportRow(old,project,work.developerId!,work.accountId!);
          });
          const {error}=await admin.from('developer_projects').upsert(rows,{onConflict:'developer_id,source_project_id'});if(error)throw error;
          work.dirtyProjectKeys=[];
        }
        if(work.pendingUrls.length){c.phase='developer_scanning';await save();return json({ok:true});}
        const {data:savedProjects,error:finalReadError}=await admin.from('developer_projects').select('*').eq('developer_id',work.developerId);if(finalReadError)throw finalReadError;
        const first=savedProjects?.[0];
        const {error:companyError}=await admin.from('developers').update({first_project_name:first?.name??null,first_project_units:first?.total_units??null,last_synced_at:new Date().toISOString()}).eq('id',work.developerId);if(companyError)throw companyError;
        const result={developer_id:work.developerId,account_id:work.accountId,company_name:work.developer.company_name,projects:savedProjects?.length??0,units:(savedProjects??[]).reduce((sum,project)=>sum+detailedUnitCount(project),0),expected_projects:work.expectedProjects,source_url:work.url};
        c.developerResults=[...(c.developerResults??[]).filter((r:Record<string,any>)=>r.developer_id!==result.developer_id),result];
        c.developerIndex=(c.developerIndex??0)+1;delete c.developerWork;
        c.phase=c.developerUrls[c.developerIndex]?'developer_scanning':c.enrichUrls?.length?'enriching':c.brokers?.length?'validating':'completed';
        const totals={developers_done:c.developerResults.length,projects_done:c.developerResults.reduce((sum:number,r:Record<string,any>)=>sum+Number(r.projects??0),0),units_done:c.developerResults.reduce((sum:number,r:Record<string,any>)=>sum+Number(r.units??0),0)};
        await save({...totals,...(c.phase==='completed'?{status:'completed'}:{})});return json({ok:true});
      }
      if(c.phase==='scanning') {
        const compactAll=(rs:Record<string,any>[])=>rs.map(r=>({...compactDirectoryRows([r])[0],directory_next_url:r.directory_next_url}));
        const results=await cached(admin,'search_page',`agencies:v3:national:${c.page}`,c,async()=>{
          const d=await pacedCall('yad2-unlocker',{owner_id:job.created_by,url:agencyPageUrl(c.page,c.directoryNextUrl),page:c.page,pages:1,limit:60,preview_only:true,admin_import_job_id:job.id,admin_import_lease_token:job.lease_token});
          if(!d)throw new DelayStepFinished();
          if(!Array.isArray(d.results) || d.served_from==='pool') throw new Error('הסריקה לא החזירה תוצאות מאומתות מ־Bright Data');
          return compactAll(d.results);
        });
        const fingerprint=results.map(r=>`${r.source_url}:${r.publisher?.broker_license_number??''}`).sort().join('|');
        c.directoryExhausted=!results.length || (c.directoryPages??[]).includes(fingerprint);
        if(c.directoryExhausted) {advanceSearchPoint(c,true);await save(c.phase==='completed'?{status:'completed'}:{});return json({ok:true});}
        c.directoryPages=[...(c.directoryPages??[]),fingerprint];
        c.directoryNextUrl=agencyUrl(results[0]?.directory_next_url);
        const known=await recentKeys(results);
        const eligible:Record<string,any>[]=[];
        for(const r of results){
          const key=agencyRegistryKey(r);
          if(key && known.has(key)){c.registrySkips=(c.registrySkips??0)+1;continue;}
          if(!agencyVolumeAllowed(r,job.min_listings,job.max_listings)){
            await recordCheck(r,'disqualified','summary_volume');if(key)known.add(key);
            c.volumeSkips=(c.volumeSkips??0)+1;continue;
          }
          eligible.push(r);
        }
        c.rows=[...c.rows,...compactDirectoryRows(eligible)]; c.brokers=collectBrokers(c.rows,job.min_listings,job.max_listings).slice(0,job.target_brokers);
        c.enriched=c.enriched??0;
        const needsDetail=(r:Record<string,any>)=>agencyRegistryKey(r) && (!r.publisher?.broker_license_number || !r.publisher?.broker_name || !(r.listing_urls?.length));
        c.enrichUrls=[...new Set(eligible.filter(needsDetail).map(r=>r.source_url))].slice(0,Math.max(0,ENRICH_BUDGET-c.enriched));
        for(const r of eligible.filter(r=>!needsDetail(r)))await recordCheck(r,'checked','complete_card');
        if(c.enrichUrls.length && c.brokers.length<job.target_brokers){c.phase='enriching';await save();return json({ok:true});}
        if(c.brokers.length>=job.target_brokers) {c.phase='validating';delete c.rows;}
        else advanceSearchPoint(c,results.length===0);
        await save(c.phase==='completed'?{status:'completed'}:{});
      } else if(c.phase==='enriching') {
        const url=c.enrichUrls[0];
        if(url) {
          const card=c.rows.find((r:Record<string,any>)=>r.source_url===url)??{source_url:url};
          const known=await recentKeys([card]);
          const key=agencyRegistryKey(card);
          if(c.source!=='urls' && ((key && known.has(key)) || !agencyVolumeAllowed(card,job.min_listings,job.max_listings))){
            c.enrichUrls.shift();c.rows=c.rows.filter((r:Record<string,any>)=>r.source_url!==url);c.registrySkips=(c.registrySkips??0)+1;
            if(!c.enrichUrls.length)advanceSearchPoint(c);
            await save(c.phase==='completed'?{status:'completed'}:{});return json({ok:true,skipped:true});
          }
          const profile=c.source==='urls';
          const rows=await cached(admin,'item_detail',profile?`agency-profile:v1:${job.max_listings}:${url}`:`agency:v2:${url}`,c,async()=>{
            const d=await pacedCall('yad2-unlocker',{owner_id:job.created_by,url,preview_only:true,...(profile?{agency_profile:true,max_listings:job.max_listings}:{}),limit:60,pages:1,admin_import_job_id:job.id,admin_import_lease_token:job.lease_token});
            if(!d)throw new DelayStepFinished();
            return Array.isArray(d.results) ? compactDirectoryRows(d.results) : [];
          });
          const eligible=c.source==='urls'?rows:rows.filter(r=>agencyVolumeAllowed(r,job.min_listings,job.max_listings));
          await recordCheck({...card,active_listing_count:rows.find(r=>r.active_listing_count!=null)?.active_listing_count??card.active_listing_count},eligible.length?'checked':'disqualified',eligible.length?'detail_checked':'detail_volume_or_empty');
          c.rows=[...c.rows.filter((r:Record<string,any>)=>r.source_url!==url),...eligible];
          c.enrichUrls.shift(); c.enriched=(c.enriched??0)+1;
        }
        c.brokers=collectBrokers(c.rows,job.min_listings,job.max_listings).slice(0,job.target_brokers);
        if(c.brokers.length>=job.target_brokers){c.phase='validating';delete c.rows;delete c.enrichUrls;}
        else if(!c.enrichUrls.length){
          advanceSearchPoint(c);
        }
        await save(c.phase==='completed'?{status:'completed'}:{});
      } else {
        const b=c.brokers[c.brokerIndex];
        if(!b) {await save({status:'completed',stage:'completed'});return json({ok:true});}
        if(c.phase==='validating' && c.source==='urls') {
          // Instant mode: pasted links are trusted; skip per-ad pre-validation (the save step still rejects non-residential/unavailable ads).
          c.listingIndex=0;delete c.liveUrls;
          if(!b.listing_urls.length){c.brokerIndex++;await save({skipped:job.skipped+1});return json({ok:true});}
          c.phase='creating';await save();
        } else if(c.phase==='validating') {
          const d=await pacedCall('yad2-ad-status',{urls:[b.listing_urls[c.listingIndex]]});
          if(!d)return json({ok:true,waiting:true});
          c.liveUrls=c.liveUrls??[];
          if(d.statuses?.[b.listing_urls[c.listingIndex]]==='live') c.liveUrls.push(b.listing_urls[c.listingIndex]);
          else if(d.statuses?.[b.listing_urls[c.listingIndex]]!=='gone') {
            // Unknown status (unreadable DOM/anti-bot page): pasted links are trusted and directory scans soft-warn; both continue as unpublished drafts.
            console.warn('[broker-import] listing status unverified, treating as active',{job:job.id,source:c.source??'directory',url:b.listing_urls[c.listingIndex]});
            c.liveUrls.push(b.listing_urls[c.listingIndex]);
          }
          c.listingIndex++;
          if(c.listingIndex>=b.listing_urls.length) {
            b.listing_urls=c.liveUrls;delete c.liveUrls;c.listingIndex=0;
            if(b.listing_urls.length<job.min_listings){c.brokerIndex++;await save({skipped:job.skipped+1});return json({ok:true});}
            c.phase='creating';
          }
          await save();
        } else if(c.phase==='creating') {
          const {data:profiles,error}=b.phone?await admin.from('profiles').select('id').eq('phone',b.phone).limit(2):{data:[],error:null};if(error)throw error;
          let brokerId:string;
          if(profiles?.length) {
            const {data:onboarding}=await admin.from('admin_broker_onboarding').select('user_id,first_login_at').eq('user_id',profiles[0].id).maybeSingle();
            if(profiles.length!==1 || !onboarding || onboarding.first_login_at){c.brokerIndex++;c.phase='validating';await save({skipped:job.skipped+1});return json({ok:true});}
            brokerId=profiles[0].id;
          } else {
            const d=await call('super-admin-create-user',{full_name:b.full_name,phone_e164:b.phone,...(b.email?{email:b.email}:{}),broker_license_number:b.license_number,approve_broker:true,import_job_id:job.id});
            if(!d.user_id)throw new Error('יצירת המתווך נכשלה');brokerId=d.user_id;
          }
          if(b.office_name) {
            const {data:office}=await admin.from('white_label_settings').select('id,agency_name,agency_description').eq('user_id',brokerId).maybeSingle();
            if(!office){const {error}=await admin.from('white_label_settings').insert({user_id:brokerId,agency_name:b.office_name,brokerage_name:b.office_name,brokerage_license:b.license_number,...(b.agency_description?{agency_description:b.agency_description}:{})});if(error)throw error;}
            else if(!office.agency_description && b.agency_description){const {error}=await admin.from('white_label_settings').update({agency_description:b.agency_description}).eq('id',office.id).is('agency_description',null);if(error)throw error;}
          }
          if(b.imported_bio) {
            const {error}=await admin.from('profiles').update({imported_public_bio:b.imported_bio}).eq('id',brokerId).is('imported_public_bio',null);if(error)throw error;
          }
          c.brokerResults=[...(c.brokerResults??[]).filter((r:Record<string,any>)=>r.broker_id!==brokerId),{broker_id:brokerId,full_name:b.full_name??null,office_name:b.office_name??null,license_number:b.license_number??null,source_url:b.source_url??b.listing_urls?.[0]??null,listings:b.listing_urls?.length??0}];
          c.brokerId=brokerId;c.brokerListingsDone=0;c.phase='importing';await save();
        } else if(c.phase==='importing') {
          const d=await pacedCall('yad2-unlocker',{owner_id:c.brokerId,url:b.listing_urls[c.listingIndex],import_item:true,residential_only:true,limit:1,pages:1});
          if(!d)return json({ok:true,waiting:true});
          if(!d.listing_id)throw new Error('המודעה לא נשמרה; אפשר להמשיך מאותה נקודה');
          const {error}=await admin.from('listings').update({status:'pending',is_published:false,affiliate_enabled:false}).eq('id',d.listing_id).eq('workspace_owner_id',c.brokerId).eq('is_published',false).eq('affiliate_enabled',false);if(error)throw error;
          const next=nextImportPoint(c.brokerIndex,c.listingIndex,b.listing_urls.length);
          c.brokerListingsDone=(c.brokerListingsDone??0)+1;
          const done=next.brokerIndex>c.brokerIndex;Object.assign(c,next);
          if(done){c.phase='validating';delete c.brokerId;delete c.brokerListingsDone;}
          await save({listings_done:job.listings_done+1,brokers_done:job.brokers_done+(done?1:0)});
        }
      }
      return json({ok:true});
    } catch(e) {
      if(e instanceof DelayStepFinished)return json({ok:true,waiting:true});
      if(e instanceof ImportAvailabilityError) {
        const skipped=skipRestrictedImport(c);
        if(skipped) {
          console.log('[broker-import-skip]',JSON.stringify({job_id:job.id,code:e.code,phase:c.phase,page:c.page,broker_index:c.brokerIndex,listing_index:c.listingIndex}));
          await save({skipped:job.skipped+1,brokers_done:job.brokers_done+(skipped.brokerFinished?1:0),error:null,...(c.phase==='completed'?{status:'completed'}:{})});
          return json({ok:true,skipped:true});
        }
      }
      if(e instanceof ProviderTimeoutError && autonomousDeveloper()) {
        c.transientRetries=(c.transientRetries??0)+1;
        c.waitScope='developer';c.waitReason=DEVELOPER_TRANSIENT_RETRY;
        c.waitUntil=developerRetryDeadline(DEVELOPER_TRANSIENT_RETRY,c.transientRetries);
        console.warn('[developer-import-auto-retry]',JSON.stringify({job_id:job.id,phase:c.phase,attempt:c.transientRetries,status:e.status??null,retry_at:new Date(c.waitUntil).toISOString()}));
        await save({status:'running',error:null});
        return json({ok:true,waiting:true,retry_at:c.waitUntil});
      }
      if(e instanceof ProviderTimeoutError && ['scanning','enriching'].includes(c.phase)) {
        // Broker discovery only: a slow page is skipped softly.
        console.warn('[broker-import-timeout-skip]',JSON.stringify({job_id:job.id,phase:c.phase,page:c.page,status:e.status??null,url:c.phase==='enriching'?c.enrichUrls?.[0]:null}));
        c.timeoutSkips=(c.timeoutSkips??0)+1;skipRestrictedImport(c);
        await save({error:null,...(c.phase==='completed'?{status:'completed'}:{})});
        return json({ok:true,skipped:true});
      }
      if(e instanceof ProviderRateLimitError) {
        c.rateRetries=(c.rateRetries??0)+1;c.waitReason='rate_limit';
        c.waitUntil=developerRetryDeadline('rate_limit',c.rateRetries,Date.now(),e.retryAfterMs);
        if(autonomousDeveloper()) {
          c.waitScope='developer';
          console.warn('[developer-import-rate-retry]',JSON.stringify({job_id:job.id,phase:c.phase,attempt:c.rateRetries,retry_at:new Date(c.waitUntil).toISOString()}));
          await save({status:'running',error:null});
          return json({ok:true,waiting:true,retry_at:c.waitUntil});
        }
        await save({status:'paused',error:'מגבלת בקשות (429). הייבוא מושהה; ההתקדמות והמטמון נשמרו. יש להמשיך ידנית לאחר השהיית הבטיחות.'});
        return json({ok:true,waiting:true});
      }
      const message=e instanceof Error?e.message:'הייבוא נעצר';
      // Batch links: a permanent failure on one developer link is logged per item and the loop continues with the next link.
      if(String(c.phase??'').startsWith('developer_') && Array.isArray(c.developerUrls)) {
        const url=c.developerUrls[c.developerIndex??0];
        c.developerResults=[...(c.developerResults??[]),{source_url:url,status:'failed',error:message,company_name:c.developerWork?.developer?.company_name??null,developer_id:c.developerWork?.developerId??null,account_id:c.developerWork?.accountId??null,projects:0,units:0}];
        c.developerIndex=(c.developerIndex??0)+1;delete c.developerWork;
        c.phase=c.developerUrls[c.developerIndex]?'developer_scanning':c.enrichUrls?.length?'enriching':c.brokers?.length?'validating':'completed';
        const ok=(c.developerResults as Record<string,any>[]).filter(r=>r.status!=='failed');
        if(c.phase!=='completed'){await save({error:null});return json({ok:true,item_failed:true});}
        await save(ok.length||c.brokers?.length?{status:'completed',error:null}:{status:'failed',error:message});
        return json({ok:true,item_failed:true});
      }
      await save({status:autonomousDeveloper()?'failed':'paused',error:message});
      return json({ok:false,...(autonomousDeveloper()?{failed:true}:{paused:true})});
    }
  } catch(e) {return json({error:e instanceof Error?e.message:'הבקשה נכשלה'},400);}
});
class DelayStepFinished extends Error {}