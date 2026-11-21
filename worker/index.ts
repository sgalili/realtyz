import * as cheerio from 'cheerio';
import { configuration, retryDelay } from './policy.ts';
import { parseAgencies, agencyDirectoryUrl, agencyVolumeAllowed } from '../supabase/functions/_shared/yad2Agencies.ts';
import { parseDeveloperDirectory, DEVELOPER_DIRECTORY_URL } from '../supabase/functions/_shared/yad2DeveloperDirectory.ts';
import { readPage, newDeveloperQueueWork, mergeDeveloperQueuePage, detailedUnitCount } from '../supabase/functions/_shared/yad2DeveloperImport.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Job = any;
class WorkerError extends Error { constructor(message: string, public status = 500, public retryAfterMs = 0) { super(message); } }

/** A background process only: no HTTP server and no browser/service-role credentials. */
export async function startImportWorker() {
  if (process.env.IMPORT_WORKER_ENABLED !== 'true') return;
  const config = configuration(process.env);
  let stopping = false;
  process.once('SIGTERM', () => { stopping = true; });
  process.once('SIGINT', () => { stopping = true; });
  const api = async (body: any) => {
    const response = await fetch(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-import-worker-secret': config.secret }, body: JSON.stringify({ ...body, worker_id: config.id }), signal: AbortSignal.timeout(150000) });
    const result = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new WorkerError(result.error ?? `cloud_http_${response.status}`,response.status);
    return result;
  };
  let nextRequestAt = 0;
  const readSource = async (url: string) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/.test(target.hostname) || target.username || target.password) throw new WorkerError('invalid_source_url',400);
    await delay(Math.max(0,nextRequestAt-Date.now()));
    nextRequestAt = Date.now()+1000;
    const response = await fetch('https://api.brightdata.com/request', { method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({zone:config.zone,url,format:'raw'}),signal:AbortSignal.timeout(120000)});
    const html = await response.text();
    const providerError = `${response.headers.get('x-brd-err-code') ?? ''} ${response.headers.get('x-brd-error') ?? ''}`;
    console.log(JSON.stringify({event:'source_response',url,status:response.status,zone:config.zone,transport:'Web Unlocker REST',bytes:html.length,provider_error:providerError}));
    if (/client_10020|account.*suspend|billing.*inactive/i.test(providerError+' '+html.slice(0,500))) throw new WorkerError('Bright Data account suspended',407);
    if (!response.ok || providerError.trim()) {
      const retry = Number(response.headers.get('retry-after'));
      throw new WorkerError(`Bright Data ${response.status}: ${providerError || html.slice(0,300).split(config.token).join('[redacted]')}`,response.status===200?502:response.status,Number.isFinite(retry)?retry*1000:0);
    }
    if (!html.trim()) throw new WorkerError('Bright Data returned an empty page',502);
    if (html.length>8000000) throw new WorkerError('Source page exceeds safe size limit',413);
    return html;
  };

  const runJob = async (job: Job) => {
    const c = structuredClone(job.checkpoint);
    const counts:any = Object.fromEntries(['brokers_done','developers_done','listings_done','projects_done','units_done','skipped'].map(k=>[k,job[k]??0]));
    const scope = {job_id:job.id,lease_token:job.lease_token};
    let lost = false;
    let stage = job.stage;
    const heartbeat = setInterval(() => {
      void api({action:'progress',...scope,stage,counts:{},checkpoint:{}}).then(r=>{if(r.stop)lost=true;}).catch(()=>{lost=true;});
    },30000);
    const progress = async (status='running',release=false,error:string|null=null) => {
      const checkpoint = {...c};
      // These arrays are server-owned, updated by the save operations themselves.
      delete checkpoint.brokerResults; delete checkpoint.developerResults;
      const r=await api({action:'progress',...scope,stage,status,counts,checkpoint,release,error});
      if(r.stop)lost=true;
    };
    const successful = () => { c.transientRetries=0;c.lastSuccessfulActionAt=new Date().toISOString();delete c.waitUntil;delete c.waitReason; };
    try {
      c.workerFrontier ??= c.autoDevelopers?[DEVELOPER_DIRECTORY_URL]:c.source==='urls'?[]:[agencyDirectoryUrl(c.directoryQuery??'')];
      c.workerVisited ??=[];
      c.workerEntities ??= c.source==='urls'&&!c.autoDevelopers?[...(c.developerUrls??[]).map((url:string)=>({kind:'developer',url})),...(c.enrichUrls??[]).map((url:string)=>({kind:'broker',url}))]:[];
      c.workerProcessed ??=[];
      while(!stopping&&!lost) {
        if(c.activeBroker) {
          stage='importing';
          const broker=c.activeBroker;const url=broker.listing_urls[c.workerListingIndex??0];
          if(!url){delete c.activeBroker;c.workerListingIndex=0;await progress();continue;}
          const html=await readSource(url);
          let saved:any;
          try { saved=await api({action:'listing',...scope,url,html,broker_id:broker.broker_id}); }
          catch(e) {if((e as WorkerError).status===422){counts.skipped++;c.workerListingIndex=(c.workerListingIndex??0)+1;await progress();continue;}throw e;}
          if(!saved.listing_id)throw new WorkerError('Listing was not saved');
          c.savedListingIds??=[];
          if(!c.savedListingIds.includes(saved.listing_id)){c.savedListingIds.push(saved.listing_id);counts.listings_done=c.savedListingIds.length;}
          c.workerListingIndex=(c.workerListingIndex??0)+1;successful();await progress();continue;
        }
        if(counts.brokers_done+counts.developers_done>=job.target_brokers){stage='completed';await progress('completed',true);break;}
        const entity=c.workerEntities.find((e:any)=>!c.workerProcessed.includes(e.url));
        if(entity) {
          stage=entity.kind==='developer'?'developer_scanning':'creating';
          const known=await api({action:'known',...scope,...entity});
          if(known.known){c.workerProcessed.push(entity.url);counts.skipped++;await progress();continue;}
          if(entity.kind==='broker') {
            const html=await readSource(entity.url);
            let saved:any;
            try {saved=await api({action:'broker',...scope,url:entity.url,html});}
            catch(e){if([400,409,422].includes((e as WorkerError).status)&&!/(lease|job_not_running)/.test((e as Error).message)){c.workerProcessed.push(entity.url);counts.skipped++;console.log(JSON.stringify({event:'broker_rejected',url:entity.url,error:(e as Error).message}));await progress();continue;}throw e;}
            if(saved.skipped){counts.skipped++;console.log(JSON.stringify({event:'entity_skipped',url:entity.url,reason:saved.reason}));}
            else{c.activeBroker=saved.broker;counts.brokers_done=saved.brokerResults?.length??counts.brokers_done+1;}
            c.workerProcessed.push(entity.url);successful();await progress();continue;
          }
          c.workerDeveloper ??= newDeveloperQueueWork(entity.url,c.expectedProjects??1,c.maxProjects??undefined);
          const work=c.workerDeveloper;
          if(work.pendingUrls.length) {
            const url=work.pendingUrls[0];const html=await readSource(url);
            const page=readPage(html,url,work.inventoryParents?.[url]);
            mergeDeveloperQueuePage(work,{source_url:url,...page});
            successful();await progress();continue;
          }
          stage='developer_saving';
          const saved=await api({action:'developer',...scope,url:entity.url,developer:work.developer,projects:work.projects,units:work.projects.reduce((n:number,p:any)=>n+detailedUnitCount(p),0)});
          if(saved.skipped)counts.skipped++;
          else {counts.developers_done=saved.developerResults?.length??counts.developers_done+1;counts.projects_done+=(saved.result?.projects??0);counts.units_done+=(saved.result?.units??0);}
          c.workerProcessed.push(entity.url);delete c.workerDeveloper;successful();await progress();continue;
        }
        if(counts.brokers_done+counts.developers_done>=job.target_brokers||!c.workerFrontier.length){stage='completed';await progress('completed',true);break;}
        stage=c.autoDevelopers?'developer_discovering':'scanning';
        const url=c.workerFrontier[0];const html=await readSource(url);
        const parsed=c.autoDevelopers?parseDeveloperDirectory(html,url):parseAgencies(cheerio.load(html),url);
        const entities=c.autoDevelopers?(parsed as any).urls.map((url:string)=>({kind:'developer',url})):(parsed as any).results.filter((r:any)=>agencyVolumeAllowed(r,job.min_listings)).map((r:any)=>({kind:'broker',url:r.source_url,...(r.publisher?.broker_license_number?{license:r.publisher.broker_license_number}:{})}));
        for(const e of entities)if(!c.workerEntities.some((x:any)=>x.url===e.url))c.workerEntities.push(e);
        c.workerVisited.push(url);c.workerFrontier.shift();
        const next=[(parsed as any).next_url,...((parsed as any).children??[]).map((q:string)=>agencyDirectoryUrl(q))].filter(Boolean);
        for(const u of next)if(!c.workerVisited.includes(u)&&!c.workerFrontier.includes(u))c.workerFrontier.push(u);
        if(c.workerVisited.length>=600)c.workerFrontier=[];
        successful();await progress();
      }
      if(stopping&&!lost)await progress('running',true);
    } catch(error) {
      const e=error as WorkerError;
      if(e.status===409&&/lease|job_not_running/.test(e.message))return;
      c.transientRetries=(c.transientRetries??0)+1;
      const permanent=[400,401,403,407,413,422].includes(e.status);
      if(permanent||c.transientRetries>=8){await progress('failed',true,e.message);}
      else {c.waitUntil=Date.now()+retryDelay(c.transientRetries,e.retryAfterMs);c.waitReason=e.status===429?'rate_limit':'transient_retry';await progress('running',true);}
      console.error(JSON.stringify({event:'job_error',job_id:job.id,status:e.status,attempt:c.transientRetries,error:e.message,wait_until:c.waitUntil??null}));
    } finally {clearInterval(heartbeat);}
  };
  console.log('TORAFF import worker started');
  while(!stopping) {
    try{const {job}=await api({action:'claim'});if(job)await runJob(job);else await delay(5000);}
    catch(error){console.error(JSON.stringify({event:'worker_connection_error',error:(error as Error).message}));await delay(15000);}
  }
}

// Railway's dedicated worker start command. An existing Node service can import startImportWorker instead.
if (process.argv[1]?.endsWith('/worker/index.ts')) startImportWorker().catch(e=>{console.error(e.message);process.exitCode=1;});