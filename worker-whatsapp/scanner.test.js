import test from 'node:test';
import assert from 'node:assert/strict';
import { createScannerApi, runScanner, scannerConfiguration } from './scanner.js';

test('scanner stays off unless explicitly enabled and uses a separate secret', () => {
  assert.equal(scannerConfiguration({}), null);
  assert.throws(() => scannerConfiguration({ BROKER_WA_SCANNER_ENABLED: 'true', TORAFF_BROKER_WA_SCANNER_API_URL: 'https://x.test/a', BROKER_WA_SCANNER_WORKER_SECRET: 's', BROKER_WA_WORKER_SHARED_SECRET: 's' }), /differ/);
});

test('scanner reads one claimed source then lets Cloud decide sending', async () => {
  const calls = []; let stop = false;
  const api = async body => { calls.push(body.action); if (body.action === 'claim_source') return { job: { id: 'j', lease_token: 't', source_url: 'u' } }; if (body.action === 'tick') stop = true; return {}; };
  await runScanner({ tick: 0 }, { source: async () => '<html>', isStopping: () => stop }, api);
  assert.deepEqual(calls, ['claim_source', 'source_result', 'tick']);
});
test('a lost result response never becomes a source failure or an immediate duplicate commit',async()=>{
  const calls=[];let claims=0,stop=false;
  const api=async body=>{calls.push(body.action);if(body.action==='claim_source')return{job:claims++===0?{id:'job',lease_token:'lease',source_url:'source'}:null};if(body.action==='source_result')throw new TypeError('connection reset');if(body.action==='tick')stop=true;return{};};
  await runScanner({tick:0},{source:async()=>'<html>',isStopping:()=>stop},api);
  assert.deepEqual(calls,['claim_source','source_result','claim_source','tick']);
});
test('worker API never retries a claim or tick whose response was lost',async()=>{
  for(const action of ['claim_source','tick','source_result']){
    let calls=0;const api=createScannerApi({api:'https://example.test/scanner',secret:'test-only'},async()=>{calls++;throw new TypeError('connection reset');});
    await assert.rejects(api({action}),/connection reset/);assert.equal(calls,1);
  }
});