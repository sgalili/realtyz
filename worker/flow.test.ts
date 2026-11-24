import test from 'node:test';
import assert from 'node:assert/strict';
import { startImportWorker } from './index.ts';

test('external worker reads Bright Data itself and imports each broker’s 2 properties before discovering the next broker', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { IMPORT_WORKER_ENABLED:'true',TORAFF_IMPORT_API_URL:'https://worker-api.example.test',IMPORT_WORKER_SHARED_SECRET:'not-a-real-secret-only-a-test-value',BRIGHT_DATA_API_KEY:'not-a-real-provider-token',BRIGHTDATA_UNLOCKER_ZONE:'test-zone' });
  const requests:any[]=[];
  let claimed=false;
  const reports:any[]=[];
  const source='https://www.yad2.co.il/realestate/agency/1234';
  globalThis.fetch=(async (url:any,options:any)=>{
    const body=JSON.parse(options.body);requests.push({url:String(url),body});
    if(String(url)==='https://api.brightdata.com/request') {
      assert.equal(body.zone,'test-zone');assert.equal(body.format,'raw');assert.equal(body.session,undefined);
      return new Response('<html>worker source fixture</html>');
    }
    let result:any;
    if(body.action==='claim') {
      assert.equal(claimed,false);claimed=true;
      result={job:{id:'test-job',lease_token:'test-lease',stage:'creating',target_brokers:2,checkpoint:{execution:'external',source:'urls',enrichUrls:[source,source+'/second'],developerUrls:[]}}};
    } else if(body.action==='known')result={known:false};
    else if(body.action==='broker'){const second=body.url.endsWith('/second');result={broker:{broker_id:second?'second':'first',listing_urls:['https://www.yad2.co.il/realestate/item/aaa','https://www.yad2.co.il/realestate/item/bbb']},brokerResults:Array.from({length:second?2:1},(_,i)=>({broker_id:`broker-${i}`}))};}
    else if(body.action==='listing')result={listing_id:body.broker_id+(body.url.endsWith('aaa')?'-1':'-2')};
    else if(body.action==='progress') {
      reports.push(body);result={stop:body.status==='completed'};
      if(body.status==='completed')process.emit('SIGTERM');
    } else throw new Error('Unexpected scanner action');
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try { await startImportWorker(); }
  finally { globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous); }
  assert.equal(requests.filter(r=>r.url==='https://api.brightdata.com/request').length,6);
  assert.equal(reports.at(-1).counts.brokers_done,2);
  assert.equal(reports.at(-1).counts.listings_done,4);
  assert.equal(reports.at(-1).status,'completed');
  assert.deepEqual(requests.filter(r=>['broker','listing'].includes(r.body.action)).map(r=>r.body.action),['broker','listing','listing','broker','listing','listing']);
  assert.equal(requests.some(r=>['step','continue'].includes(r.body.action)),false);
});