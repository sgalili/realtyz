import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { collectBrokers, nextImportPoint, freshImportCheckpoint, advanceSearchPoint, skipRestrictedImport } from '../_shared/brokerImportQueue.ts';
import { readWorkerResponse, ImportAvailabilityError, ProviderTimeoutError } from '../_shared/brightDataDiagnostics.ts';
import { agencyPageUrl, agencyUrl, agencyRegistryKey, agencyVolumeAllowed, recentAgencyCheck } from '../_shared/yad2Agencies.ts';
import { PROVIDER_GAP_MS, ProviderRateLimitError, rateBackoffMs, rateCooldownRemaining } from '../_shared/brightDataThrottle.ts';

const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('start'),target_brokers:z.number().int().min(1).max(100),min_listings:z.number().int().min(1).max(10),max_listings:z.number().int().min(1).max(10)}).strict(),
  z.object({action:z.literal('start_urls'),urls:z.array(z.string().max(500)).min(1).max(100),max_listings:z.number().int().min(1).max(10).optional()}).strict(),
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
      const urls=[...new Set(input.urls.map(u=>agencyUrl(u.trim())).filter((u):u is string=>Boolean(u)))];
      if(!urls.length) return json({error:'לא נמצאו קישורי משרד/מתווך תקינים של יד2'},400);
      const checkpoint={...freshImportCheckpoint(),source:'urls',phase:'enriching',enrichUrls:urls,enriched:0,invalidUrls:input.urls.length-urls.length};
      const {data,error}=await admin.rpc('start_fresh_broker_import_job',{_actor:caller.userId,_target:urls.length,_min:1,_max:input.max_listings??10,_checkpoint:checkpoint});
      if(error) throw new Error(error.code==='23505'?'כבר קיים ייבוא פעיל':error.message);
      return json({job_id:data,accepted:urls.length,rejected:input.urls.length-urls.length});
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
      const wait=Math.max(0,Number(c.nextRequestAt??0)-Date.now());
      if(wait>0) {
        c.waitUntil=Date.now()+wait;c.waitReason='throttle';
        await admin.from('broker_import_jobs').update({checkpoint:c,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token);
        // Delay-only step preserves the 120s fetch budget and makes stop immediate.
        await new Promise(resolve=>setTimeout(resolve,Math.min(wait,PROVIDER_GAP_MS)));
        await save();return null;
      }
      const {data:state}=await admin.from('broker_import_jobs').select('status,lease_token').eq('id',job.id).single();
      if(state?.status!=='running'||state.lease_token!==job.lease_token)throw new Error('הייבוא הושהה לפני הבקשה הבאה');
      delete c.waitUntil;delete c.waitReason;
      try {return await call(name,body);}
      finally {c.nextRequestAt=Date.now()+PROVIDER_GAP_MS;}
    };
    try {
      if(c.waitReason==='rate_limit') {
        // Even old automatic-retry checkpoints require an explicit manual resume.
        await save({status:'paused',error:'מגבלת בקשות (429). הייבוא מושהה; ההתקדמות והמטמון נשמרו. יש להמשיך ידנית לאחר השהיית הבטיחות.'});
        return json({ok:true,paused:true});
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
          const rows=await cached(admin,'item_detail',`agency:v2:${url}`,c,async()=>{
            const d=await pacedCall('yad2-unlocker',{owner_id:job.created_by,url,preview_only:true,limit:60,pages:1,admin_import_job_id:job.id,admin_import_lease_token:job.lease_token});
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
        if(c.phase==='validating') {
          const d=await pacedCall('yad2-ad-status',{urls:[b.listing_urls[c.listingIndex]]});
          if(!d)return json({ok:true,waiting:true});
          c.liveUrls=c.liveUrls??[];
          if(d.statuses?.[b.listing_urls[c.listingIndex]]==='live') c.liveUrls.push(b.listing_urls[c.listingIndex]);
          else if(d.statuses?.[b.listing_urls[c.listingIndex]]!=='gone') throw new Error('לא ניתן לאמת כרגע שהמודעה פעילה; הייבוא נעצר לפני יצירת החשבון');
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
            const {data:office}=await admin.from('white_label_settings').select('id,agency_name').eq('user_id',brokerId).maybeSingle();
            if(!office){const {error}=await admin.from('white_label_settings').insert({user_id:brokerId,agency_name:b.office_name,brokerage_name:b.office_name,brokerage_license:b.license_number});if(error)throw error;}
          }
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
      if(e instanceof ProviderTimeoutError && ['scanning','enriching'].includes(c.phase)) {
        // Discovery only: a slow page is skipped softly. Validation/creation still stop safely.
        console.warn('[broker-import-timeout-skip]',JSON.stringify({job_id:job.id,phase:c.phase,page:c.page,status:e.status??null,url:c.phase==='enriching'?c.enrichUrls?.[0]:null}));
        c.timeoutSkips=(c.timeoutSkips??0)+1;skipRestrictedImport(c);
        await save({error:null,...(c.phase==='completed'?{status:'completed'}:{})});
        return json({ok:true,skipped:true});
      }
      if(e instanceof ProviderRateLimitError) {
        c.rateRetries=(c.rateRetries??0)+1;c.waitReason='rate_limit';
        c.waitUntil=Date.now()+rateBackoffMs(c.rateRetries,e.retryAfterMs);
        await save({status:'paused',error:'מגבלת בקשות (429). הייבוא מושהה; ההתקדמות והמטמון נשמרו. יש להמשיך ידנית לאחר השהיית הבטיחות.'});
        return json({ok:true,waiting:true});
      }
      await save({status:'paused',error:e instanceof Error?e.message:'הייבוא נעצר'});return json({ok:false,paused:true});
    }
  } catch(e) {return json({error:e instanceof Error?e.message:'הבקשה נכשלה'},400);}
});
class DelayStepFinished extends Error {}