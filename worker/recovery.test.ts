import test from 'node:test';
import assert from 'node:assert/strict';
import { startImportWorker } from './index.ts';

const env={IMPORT_WORKER_ENABLED:'true',TORAFF_IMPORT_API_URL:'https://worker-api.example.test',IMPORT_WORKER_SHARED_SECRET:'test-secret',BRIGHT_DATA_API_KEY:'test-token',BRIGHTDATA_UNLOCKER_ZONE:'test-zone',WORKER_REQUEST_INTERVAL_MS:'250'};
async function withFetch(handler:(body:any,source:boolean)=>Promise<any>) {
  const before={...process.env};const fetchBefore=globalThis.fetch;
  Object.assign(process.env,env);
  globalThis.fetch=(async(url:any,options:any)=>{
    const source=String(url)==='https://api.brightdata.com/request';
    const result=await handler(JSON.parse(options.body),source);
    return result instanceof Response?result:new Response(JSON.stringify(result));
  }) as typeof fetch;
  try{await startImportWorker();}finally{
    globalThis.fetch=fetchBefore;
    for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];
    Object.assign(process.env,before);
  }
}
test('existing entity is skipped before any paid source read',async()=>{
  let reads=0;let final:any;
  await withFetch(async(body,source)=>{
    if(source){reads++;throw new Error('Paid read must not run');}
    if(body.action==='claim')return {job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',enrichUrls:['https://www.yad2.co.il/realestate/agency/1234']}}};
    if(body.action==='known')return {known:true};
    if(body.action==='progress'){if(body.status==='completed'){final=body;process.emit('SIGTERM');}return {stop:false};}
    throw new Error('Unexpected save');
  });
  assert.equal(reads,0);assert.equal(final.counts.skipped,1);assert.equal(final.counts.brokers_done,0);
});
test('eighth failure is terminal and does not restart the retry countdown',async()=>{
  let claims=0;let final:any;
  await withFetch(async(body,source)=>{
    if(source)return new Response('Temporary provider failure',{status:503});
    if(body.action==='claim'){claims++;return {job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',transientRetries:7,enrichUrls:['https://www.yad2.co.il/realestate/agency/1234']}}};}
    if(body.action==='known')return {known:false};
    if(body.action==='progress'){if(body.status==='failed'){final=body;process.emit('SIGTERM');}return {stop:false};}
    throw new Error('Unexpected action');
  });
  assert.equal(claims,1);assert.equal(final.checkpoint.transientRetries,8);assert.equal(final.status,'failed');
});
test('account suspension fails the job and stops claiming more jobs',async()=>{
  let claims=0;let final:any;
  await withFetch(async(body,source)=>{
    if(source)return new Response('account suspended client_10020',{status:407});
    if(body.action==='claim'){claims++;return {job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',enrichUrls:['https://www.yad2.co.il/realestate/agency/1234']}}};}
    if(body.action==='known')return {known:false};
    if(body.action==='progress'){if(body.status==='failed')final=body;return {stop:false};}
    throw new Error('Unexpected action');
  });
  assert.equal(claims,1);assert.equal(final.status,'failed');assert.match(final.error,/suspended/);
});
test('developer identity and partial hierarchy are saved before final completion',async()=>{
  const saves:any[]=[];let final:any;
  await withFetch(async(body,source)=>{
    if(source)return new Response('<html><title>חברת בדיקה | יד2</title></html>');
    if(body.action==='claim')return {job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',developerUrls:['https://www.yad2.co.il/yad1/developers/1234']}}};
    if(body.action==='known')return {known:false};
    if(body.action==='developer'){
      saves.push(body);
      return body.partial?{pending:{developer_id:'d',owner:'o',source_url:body.url},result:{projects:0,units:0}}:{developerResults:[{developer_id:'d'}],result:{projects:0,units:0}};
    }
    if(body.action==='progress'){if(body.status==='completed'){final=body;process.emit('SIGTERM');}return {stop:false};}
    throw new Error('Unexpected action');
  });
  assert.equal(saves.length,2);assert.equal(saves[0].partial,true);assert.equal(saves[1].partial,undefined);
  assert.equal(final.counts.developers_done,1);
});
test('broker saved just before a crash resumes property work without rereading the broker',async()=>{
  const reads:string[]=[];let final:any;
  const url='https://www.yad2.co.il/realestate/agency/1234';
  const listing='https://www.yad2.co.il/realestate/item/aaa';
  await withFetch(async(body,source)=>{
    if(source){reads.push(body.url);return new Response('fixture');}
    if(body.action==='claim')return {job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',enrichUrls:[url],brokerResults:[{broker_id:'b',source_url:url,listing_urls:[listing]}]}}};
    if(body.action==='listing')return {listing_id:'saved-listing'};
    if(body.action==='progress'){if(body.status==='completed'){final=body;process.emit('SIGTERM');}return {stop:false};}
    throw new Error('Already saved broker should not be read or created');
  });
  assert.deepEqual(reads,[listing]);assert.equal(final.counts.brokers_done,1);assert.equal(final.counts.listings_done,1);
  assert.equal(final.checkpoint.activeBroker,null);
  assert.equal(final.checkpoint.workerListingDoneUrls,null);
  assert.equal(final.checkpoint.waitUntil,null);
});