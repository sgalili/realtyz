import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { collectBrokers, nextImportPoint } from '../_shared/brokerImportQueue.ts';

const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('start'),target_brokers:z.number().int().min(1).max(100),min_listings:z.number().int().min(1).max(10),max_listings:z.number().int().min(1).max(10)}).strict(),
  z.object({action:z.enum(['pause','resume','step']),job_id:z.string().uuid()}).strict(),
]);
const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
// Bright Data must answer within 45 seconds; silence becomes a visible, resumable error.
const CALL_TIMEOUT_MS = 45_000;
const BRIGHT_DATA_ERROR = 'שגיאת חיבור ל־Bright Data - אנא בדוק את המפתחות או נסה שוב';
// Search pages rarely carry phone/license, so unknown publishers are opened one by one, within a per-job budget.
const ENRICH_BUDGET = 150;
// Scrape cache: search pages stay fresh 12h, ad details 72h. Freshness is never extended on read.
const CACHE_TTL_MS = { search_page: 12 * 3600_000, item_detail: 72 * 3600_000 } as const;
type CacheKind = keyof typeof CACHE_TTL_MS;
async function cached(admin: ReturnType<typeof adminClient>, kind: CacheKind, key: string, c: Record<string, any>, fetcher: () => Promise<Record<string, any>[]>) {
  const { data } = await admin.from('broker_import_scrape_cache').select('results,fetched_at,hits').eq('cache_key', key).maybeSingle();
  if (data && Date.now() - Date.parse(data.fetched_at) < CACHE_TTL_MS[kind] && Array.isArray(data.results)) {
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
  let r: Response;
  try { r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(CALL_TIMEOUT_MS)}); }
  catch { throw new Error(BRIGHT_DATA_ERROR); }
  const data = await r.json().catch(() => null);
  if (!data) throw new Error(BRIGHT_DATA_ERROR);
  if (!r.ok || data.error || data.ok === false || data.success === false) throw new Error(String(data.detail ?? data.error ?? `HTTP ${r.status}`));
  return data;
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
      const {data,error}=await admin.from('broker_import_jobs').insert({target_brokers:input.target_brokers,min_listings:input.min_listings,max_listings:input.max_listings,workspace_owner_id:caller.userId,created_by:caller.userId,checkpoint:{page:1,deal:'sale',rows:[],brokers:[],brokerIndex:0,listingIndex:0,phase:'scanning'}}).select('id').single();
      if(error) throw new Error(error.code==='23505'?'כבר קיים ייבוא פעיל':error.message);
      return json({job_id:data.id});
    }
    const {data:existing,error:readError}=await admin.from('broker_import_jobs').select('*').eq('id',input.job_id).single();
    if(readError || !existing || !await isSuperAdmin(existing.created_by,admin)) return json({error:'job_unavailable'},404);
    if(input.action==='pause') {
      if(existing.status==='completed') return json({ok:true});
      const scoped=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:req.headers.get('Authorization')??''}}});
      const {error}=await scoped.rpc('control_broker_import_job',{_id:input.job_id,_action:'pause'}); if(error) throw error;
      return json({ok:true});
    }
    if(input.action==='resume') {
      if(existing.status==='completed') return json({error:'הייבוא הסתיים'},400);
      const scoped=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:req.headers.get('Authorization')??''}}});
      const {error}=await scoped.rpc('control_broker_import_job',{_id:input.job_id,_action:'resume'}); if(error) throw error;
      return json({ok:true});
    }
    const {data:claimed,error:claimError}=await admin.rpc('claim_broker_import_step',{_id:input.job_id}); if(claimError) throw claimError;
    const job=claimed?.[0]; if(!job) return json({ok:true,idle:true});
    const c=job.checkpoint as Record<string,any>; const started=Date.now();
    const save=async (patch:Record<string,unknown>={})=> {
      const duration=Date.now()-started;
      const {error}=await admin.from('broker_import_jobs').update({checkpoint:c,stage:c.phase,lease_token:null,lease_until:null,step_average_ms:job.step_average_ms?Number(job.step_average_ms)*0.7+duration*0.3:duration,updated_at:new Date().toISOString(),...patch}).eq('id',job.id).eq('lease_token',job.lease_token);
      if(error) throw error;
    };
    try {
      if(c.phase==='scanning') {
        const compactAll=(rs:Record<string,any>[])=>rs.map(r=>({source_url:r.source_url,owner_name:r.owner_name,owner_phone:r.owner_phone,publisher:r.publisher}));
        const results=await cached(admin,'search_page',`search:${c.deal}:${c.page}`,c,async()=>{
          const d=await call('yad2-unlocker',{owner_id:job.created_by,url:`https://www.yad2.co.il/realestate/${c.deal==='sale'?'forsale':'rent'}?page=${c.page}`,page:c.page,pages:1,limit:60,preview_only:true,admin_import_job_id:job.id});
          if(!Array.isArray(d.results) || d.served_from==='pool') throw new Error('הסריקה לא החזירה תוצאות מאומתות מ־Bright Data');
          return compactAll(d.results);
        });
        const d={results};
        const compact=(r:Record<string,any>)=>({source_url:r.source_url,owner_name:r.owner_name,owner_phone:r.owner_phone,publisher:r.publisher});
        c.rows=[...c.rows,...d.results.map(compact)]; c.brokers=collectBrokers(c.rows,job.min_listings,job.max_listings).slice(0,job.target_brokers);
        c.enriched=c.enriched??0;
        c.enrichUrls=d.results.filter((r:Record<string,any>)=>r.publisher?.publisher_kind!=='private' && (!r.owner_phone || !r.publisher?.broker_license_number)).map((r:Record<string,any>)=>r.source_url).slice(0,Math.max(0,ENRICH_BUDGET-c.enriched));
        if(c.enrichUrls.length && c.brokers.length<job.target_brokers){c.phase='enriching';await save();return json({ok:true});}
        if(c.brokers.length>=job.target_brokers) {c.phase='validating';delete c.rows;}
        else if(c.page>=20 || d.results.length===0) {
          if(c.deal==='sale'){c.deal='rent';c.page=1;}
          else if(c.brokers.length){c.phase='validating';delete c.rows;}
          else throw new Error('לא נמצאו מתווכים עם שם, נייד, רישיון ומספר הנכסים המבוקש; ניתן להמשיך את החיפוש');
        } else c.page++;
        await save();
      } else if(c.phase==='enriching') {
        const url=c.enrichUrls[0];
        if(url) {
          const rows=await cached(admin,'item_detail',`item:${url}`,c,async()=>{
            const d=await call('yad2-unlocker',{owner_id:job.created_by,url,import_item:true,preview_only:true,limit:1,pages:1});
            const r=d.results?.[0]; return r?[{source_url:r.source_url,owner_name:r.owner_name,owner_phone:r.owner_phone,publisher:r.publisher}]:[];
          });
          const row=rows[0];
          if(row) c.rows=c.rows.map((r:Record<string,any>)=>r.source_url===url?{source_url:row.source_url,owner_name:row.owner_name,owner_phone:row.owner_phone,publisher:row.publisher}:r);
          c.enrichUrls.shift(); c.enriched=(c.enriched??0)+1;
        }
        c.brokers=collectBrokers(c.rows,job.min_listings,job.max_listings).slice(0,job.target_brokers);
        if(c.brokers.length>=job.target_brokers){c.phase='validating';delete c.rows;delete c.enrichUrls;}
        else if(!c.enrichUrls.length){
          if(c.page>=20){if(c.deal==='sale'){c.deal='rent';c.page=1;c.phase='scanning';}else if(c.brokers.length){c.phase='validating';delete c.rows;}else throw new Error('לא נמצאו מספיק פרטי מתווכים מאומתים');}
          else {c.page++;c.phase='scanning';}
        }
        await save();
      } else {
        const b=c.brokers[c.brokerIndex];
        if(!b) {await save({status:'completed',stage:'completed'});return json({ok:true});}
        if(c.phase==='validating') {
          const d=await call('yad2-ad-status',{urls:[b.listing_urls[c.listingIndex]]});
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
          const {data:profiles,error}=await admin.from('profiles').select('id').eq('phone',b.phone).limit(2);if(error)throw error;
          let brokerId:string;
          if(profiles?.length) {
            const {data:onboarding}=await admin.from('admin_broker_onboarding').select('user_id,first_login_at').eq('user_id',profiles[0].id).maybeSingle();
            if(profiles.length!==1 || !onboarding || onboarding.first_login_at){c.brokerIndex++;c.phase='validating';await save({skipped:job.skipped+1});return json({ok:true});}
            brokerId=profiles[0].id;
          } else {
            const d=await call('super-admin-create-user',{full_name:b.full_name,phone_e164:b.phone,broker_license_number:b.license_number,approve_broker:true,import_job_id:job.id});
            if(!d.user_id)throw new Error('יצירת המתווך נכשלה');brokerId=d.user_id;
          }
          if(b.office_name) {
            const {data:office}=await admin.from('white_label_settings').select('id,agency_name').eq('user_id',brokerId).maybeSingle();
            if(!office){const {error}=await admin.from('white_label_settings').insert({user_id:brokerId,agency_name:b.office_name,brokerage_name:b.office_name,brokerage_license:b.license_number});if(error)throw error;}
          }
          c.brokerId=brokerId;c.phase='importing';await save();
        } else if(c.phase==='importing') {
          const d=await call('yad2-unlocker',{owner_id:c.brokerId,url:b.listing_urls[c.listingIndex],import_item:true,limit:1,pages:1});
          if(!d.listing_id)throw new Error('המודעה לא נשמרה; אפשר להמשיך מאותה נקודה');
          const {error}=await admin.from('listings').update({status:'pending',is_published:false,affiliate_enabled:false}).eq('id',d.listing_id).eq('workspace_owner_id',c.brokerId).eq('is_published',false).eq('affiliate_enabled',false);if(error)throw error;
          const next=nextImportPoint(c.brokerIndex,c.listingIndex,b.listing_urls.length);
          const done=next.brokerIndex>c.brokerIndex;Object.assign(c,next);
          if(done){c.phase='validating';delete c.brokerId;}
          await save({listings_done:job.listings_done+1,brokers_done:job.brokers_done+(done?1:0)});
        }
      }
      return json({ok:true});
    } catch(e) {
      await save({status:'paused',error:e instanceof Error?e.message:'הייבוא נעצר'});return json({ok:false,paused:true});
    }
  } catch(e) {return json({error:e instanceof Error?e.message:'הבקשה נכשלה'},400);}
});