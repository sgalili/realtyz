import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { configuration, retryDelay } from './policy.ts';
import { delay, RequestGate, readAndCommit } from './concurrency.ts';
import { parseAgencies, agencyDirectoryUrl, agencyVolumeAllowed } from '../supabase/functions/_shared/yad2Agencies.ts';
import { parseDeveloperDirectory, DEVELOPER_DIRECTORY_URL } from '../supabase/functions/_shared/yad2DeveloperDirectory.ts';
import { readPage, newDeveloperQueueWork, mergeDeveloperQueuePage, detailedUnitCount } from '../supabase/functions/_shared/yad2DeveloperImport.ts';

type Job = any;
class WorkerError extends Error { constructor(message: string, public status = 500, public retryAfterMs = 0) { super(message); } }

/** A background process only: no HTTP server and no browser/service-role credentials. */
export async function startImportWorker() {
  if (process.env.IMPORT_WORKER_ENABLED !== 'true') return;
  const config = configuration(process.env);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let providerSuspended = false;
  const api = async (body: any) => {
    const response = await fetch(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-import-worker-secret': config.secret }, body: JSON.stringify({ ...body, worker_id: config.id }), signal: AbortSignal.timeout(150000) });
    const result = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new WorkerError(result.error ?? `cloud_http_${response.status}`,response.status);
    return result;
  };
  const gate = new RequestGate(config.interval);
  const readSource = async (url: string) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/.test(target.hostname) || target.username || target.password) throw new WorkerError('invalid_source_url',400);
    await gate.enter();
    if (stopping) throw new WorkerError('Worker stopping', 503);
    if (providerSuspended) throw new WorkerError('Bright Data account suspended',407);
    let response:Response;
    try {response = await fetch('https://api.brightdata.com/request', { method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({zone:config.zone,url,format:'raw'}),signal:AbortSignal.timeout(config.timeout)});}
    catch(error){
      const reason=(error as Error).name;
      console.error(JSON.stringify({event:'source_connection_error',url,zone:config.zone,transport:'Web Unlocker REST',reason,timeout_ms:config.timeout}));
      throw new WorkerError(`Bright Data ${reason} at ${url}`,reason==='TimeoutError'?504:503);
    }
    const html = await response.text();
    const providerError = `${response.headers.get('x-brd-err-code') ?? ''} ${response.headers.get('x-brd-error') ?? ''}`.trim();
    console.log(JSON.stringify({event:'source_response',url,status:response.status,zone:config.zone,transport:'Web Unlocker REST',bytes:html.length,provider_error:providerError.split(config.token).join('[redacted]')}));
    if (/client_10020|account.*suspend|billing.*inactive/i.test(providerError+' '+html.slice(0,500))) {providerSuspended=true;throw new WorkerError('Bright Data account suspended',407);}
    if (!response.ok || providerError.trim()) {
      const header = response.headers.get('retry-after') ?? '';
      const retry = /^\d+$/.test(header) ? Number(header)*1000 : Math.max(0,Date.parse(header)-Date.now());
      const retryMs = Number.isFinite(retry) ? Math.min(180000,retry) : 0;
      if(response.status===429)gate.defer(Math.max(15000,retryMs));
      throw new WorkerError(`Bright Data ${response.status}: ${(providerError || html.slice(0,300)).split(config.token).join('[redacted]')}`,response.status===200?502:response.status,retryMs);
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
    const alive = () => { if(lost)throw new WorkerError('stale_worker_lease',409); };
    const successful = () => { c.transientRetries=0;c.lastSuccessfulActionAt=new Date().toISOString();c.waitUntil=null;c.waitReason=null; };
    try {
      c.workerFrontier ??= c.autoDevelopers?[DEVELOPER_DIRECTORY_URL]:c.source==='urls'?[]:[agencyDirectoryUrl(c.directoryQuery??'')];
      c.workerVisited ??=[];
      c.workerEntities ??= c.source==='urls'&&!c.autoDevelopers?[...(c.developerUrls??[]).map((url:string)=>({kind:'developer',url})),...(c.enrichUrls??[]).map((url:string)=>({kind:'broker',url}))]:[];
      c.workerProcessed ??=[];
      c.workerEnrichment ??=[];
      c.workerEnrichedIds ??=[];
      // Recover the gap between a machine identity save and the next client progress report.
      for(const saved of c.brokerResults??[]) {
        if(!Array.isArray(saved.listing_urls))continue;
        counts.brokers_done=Math.max(counts.brokers_done,c.brokerResults.length);
        if(!c.workerEnrichedIds.includes(saved.broker_id)&&c.activeBroker?.broker_id!==saved.broker_id&&!c.workerEnrichment.some((b:any)=>b.broker_id===saved.broker_id))c.workerEnrichment.push(saved);
        if(!c.workerProcessed.includes(saved.source_url))c.workerProcessed.push(saved.source_url);
      }
      // Saved identities are collected first; their private properties are completed afterwards.
      while(!stopping&&!lost) {
        const identitiesDone=counts.brokers_done+counts.developers_done>=job.target_brokers || (!c.workerEntities.some((e:any)=>!c.workerProcessed.includes(e.url))&&!c.workerFrontier.length);
        if(identitiesDone&&!c.activeBroker)c.activeBroker=c.workerEnrichment.shift()??null;
        if(c.activeBroker) {
          stage='importing';
          const broker=c.activeBroker;
          c.workerListingDoneUrls??=broker.listing_urls.slice(0,c.workerListingIndex??0);
          const urls=[...new Set<string>(broker.listing_urls)].filter(url=>!c.workerListingDoneUrls.includes(url)).slice(0,config.concurrency);
          if(!urls.length){c.workerEnrichedIds.push(broker.broker_id);c.activeBroker=null;c.workerListingDoneUrls=null;c.workerListingIndex=0;await progress();continue;}
          await readAndCommit(urls,readSource,async(url,html)=>{
            alive();let saved:any;
            try { saved=await api({action:'listing',...scope,url,html,broker_id:broker.broker_id}); }
            catch(e) {if((e as WorkerError).status===422){counts.skipped++;c.workerListingDoneUrls.push(url);await progress();return;}throw e;}
            if(!saved.listing_id)throw new WorkerError('Listing was not saved');
            c.savedListingIds??=[];
            if(!c.savedListingIds.includes(saved.listing_id)){c.savedListingIds.push(saved.listing_id);counts.listings_done=Math.max(counts.listings_done,c.savedListingIds.length);}
            c.workerListingDoneUrls.push(url);successful();await progress();
          });continue;
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
            else{c.workerEnrichment.push(saved.broker);counts.brokers_done=Math.max(counts.brokers_done,saved.brokerResults?.length??c.brokerResults?.length??counts.brokers_done+1);}
            c.workerProcessed.push(entity.url);successful();await progress();continue;
          }
          c.workerDeveloper ??= newDeveloperQueueWork(entity.url,c.expectedProjects??1,c.maxProjects??undefined);
          const work=c.workerDeveloper;
          if(work.pendingUrls.length) {
            // Respect first-project source order; parallelize inventory after the profile/cap is known.
            const candidates=work.pendingUrls.slice(0,config.concurrency);
            const cappedInventory=candidates.every((url:string)=>work.inventoryParents?.[url]||work.projects.some((p:any)=>p.source_url===url));
            const urls=work.developer.company_name&&(!work.maxProjects||cappedInventory)?candidates:candidates.slice(0,1);
            await readAndCommit(urls,readSource,async(url,html)=>{
              alive();if(c.workerProcessed.includes(entity.url))return;
              const page=readPage(html,url,work.inventoryParents?.[url]);
              mergeDeveloperQueuePage(work,{source_url:url,...page});
              if(work.developer.company_name) {
                const saved=await api({action:'developer',...scope,url:entity.url,developer:work.developer,projects:work.projects,partial:true});
                if(saved.skipped){work.pendingUrls=[];c.workerProcessed.push(entity.url);counts.skipped++;}
                if(saved.pending)c.externalPendingDeveloper=saved.pending;
                if(saved.result){
                  c.workerDeveloperSaved??={projects:0,units:0};
                  counts.projects_done+=Math.max(0,saved.result.projects-c.workerDeveloperSaved.projects);
                  counts.units_done+=Math.max(0,saved.result.units-c.workerDeveloperSaved.units);
                  c.workerDeveloperSaved={projects:saved.result.projects,units:saved.result.units};
                }
              }
              successful();await progress();
            });
            if(c.workerProcessed.includes(entity.url)){c.workerDeveloper=null;c.workerDeveloperSaved=null;}
            continue;
          }
          stage='developer_saving';
          const saved=await api({action:'developer',...scope,url:entity.url,developer:work.developer,projects:work.projects,units:work.projects.reduce((n:number,p:any)=>n+detailedUnitCount(p),0)});
          if(saved.skipped)counts.skipped++;
          else {counts.developers_done=saved.developerResults?.length??counts.developers_done+1;counts.projects_done+=Math.max(0,(saved.result?.projects??0)-(c.workerDeveloperSaved?.projects??0));counts.units_done+=Math.max(0,(saved.result?.units??0)-(c.workerDeveloperSaved?.units??0));}
          c.workerProcessed.push(entity.url);c.workerDeveloper=null;c.workerDeveloperSaved=null;delete c.externalPendingDeveloper;successful();await progress();continue;
        }
        if(counts.brokers_done+counts.developers_done>=job.target_brokers||!c.workerFrontier.length){stage='completed';await progress('completed',true);break;}
        stage=c.autoDevelopers?'developer_discovering':'scanning';
        await readAndCommit(c.workerFrontier.slice(0,config.concurrency),readSource,async(url,html)=>{
          alive();const parsed=c.autoDevelopers?parseDeveloperDirectory(html,url):parseAgencies(cheerio.load(html),url);
          const entities=c.autoDevelopers?(parsed as any).urls.map((url:string)=>({kind:'developer',url})):(parsed as any).results.filter((r:any)=>agencyVolumeAllowed(r,job.min_listings)).map((r:any)=>({kind:'broker',url:r.source_url,...(r.publisher?.broker_license_number?{license:r.publisher.broker_license_number}:{})}));
          for(const e of entities)if(!c.workerEntities.some((x:any)=>x.url===e.url))c.workerEntities.push(e);
          c.workerVisited.push(url);c.workerFrontier=c.workerFrontier.filter((u:string)=>u!==url);
          const next=[(parsed as any).next_url,...((parsed as any).children??[]).map((q:string)=>agencyDirectoryUrl(q))].filter(Boolean);
          for(const u of next)if(!c.workerVisited.includes(u)&&!c.workerFrontier.includes(u))c.workerFrontier.push(u);
          if(c.workerVisited.length>=600)c.workerFrontier=[];
          successful();await progress();
        });
      }
      if(stopping&&!lost)await progress('running',true);
    } catch(error) {
      const e=error as WorkerError;
      if(e.status===409&&/lease|job_not_running/.test(e.message))return;
      // Successful sibling saves must not reset a repeatedly failing page's retry budget.
      c.transientRetries=Math.max(c.transientRetries??0,job.checkpoint?.transientRetries??0)+1;
      // Persist the newest failure on the job so the admin card shows it without Railway logs.
      c.lastError={message:String(e.message??'').slice(0,500),status:e.status??null,at:new Date().toISOString(),stage};
      const permanent=[400,401,403,407,413,422].includes(e.status);
      if(permanent||c.transientRetries>=8){await progress('failed',true,e.message);}
      else {c.waitUntil=Date.now()+retryDelay(c.transientRetries,e.retryAfterMs);c.waitReason=e.status===429?'rate_limit':'transient_retry';await progress('running',true);}
      console.error(JSON.stringify({event:'job_error',job_id:job.id,status:e.status,attempt:c.transientRetries,error:e.message,wait_until:c.waitUntil??null}));
    } finally {clearInterval(heartbeat);}
  };
  console.log('TORAFF import worker started');
  try { while(!stopping&&!providerSuspended) {
    try{const {job}=await api({action:'claim'});if(job)await runJob(job);else await delay(config.poll);}
    catch(error){console.error(JSON.stringify({event:'worker_connection_error',error:(error as Error).message}));await delay(15000);}
  } } finally {process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}

// Railway's dedicated worker start command. An existing Node service can import startImportWorker instead.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startImportWorker().catch(e=>{console.error(e.message);process.exitCode=1;});