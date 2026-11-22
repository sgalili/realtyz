import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processJob, createCloudApi } from './index.js';
import { sourceAllowed, retryAfterSeconds, configuration } from './policy.js';
test('only reads exact Yad2 listing URLs', () => {
  assert.equal(sourceAllowed('https://www.yad2.co.il/realestate/item/abc123'), true);
  assert.equal(sourceAllowed('https://www.yad2.co.il.evil.test/realestate/item/abc123'), false);
  assert.equal(sourceAllowed('https://www.yad2.co.il/realestate/agencies'), false);
});
test('rate-limit waits are bounded', () => {
  assert.equal(retryAfterSeconds('600'), 180);
  assert.equal(retryAfterSeconds('invalid'), 0);
});
test('machine calls use the dedicated shared-secret header and exact worker id', async () => {
  let request;
  const api=createCloudApi({api:'https://example.test/worker',secret:'test-only',id:'wa-test'},async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({job:null})};});
  await api({action:'claim'});
  assert.equal(request.headers['x-broker-wa-worker-secret'],'test-only');
  assert.equal(request.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(request.body),{action:'claim',worker_id:'wa-test'});
});
test('accepts the existing Cloud Bright Data token name without weakening required credentials', () => {
  const env={TORAFF_BROKER_WA_API_URL:'https://example.test/worker',BROKER_WA_WORKER_SHARED_SECRET:'test-only',BRIGHTDATA_API_TOKEN:'provider-test',BRIGHTDATA_UNLOCKER_ZONE:'test'};
  assert.equal(configuration(env).token,'provider-test');
  assert.throws(()=>configuration({...env,BROKER_WA_WORKER_SHARED_SECRET:undefined}),/Missing BROKER_WA_WORKER_SHARED_SECRET/);
});
test('separate worker defaults to one channel and five-second pacing', () => {
  const config = configuration({ TORAFF_BROKER_WA_API_URL: 'https://example.test/worker', BROKER_WA_WORKER_SHARED_SECRET: 'test-only', BRIGHT_DATA_API_KEY: 'test-only', BRIGHTDATA_UNLOCKER_ZONE: 'test' });
  assert.equal(config.concurrency, 1); assert.equal(config.interval, 5000);
});
test('discovery never sends or touches import actions', async () => {
  const calls = [];
  await processJob({ id: 'job', lease_token: 'lease', status: 'running', source_url: 'https://www.yad2.co.il/realestate/item/abc123' }, { api: async body => calls.push(body), source: async () => '<main />' });
  assert.deepEqual(calls, [{ action: 'result', job_id: 'job', lease_token: 'lease', html: '<main />' }]);
});
test('worker refuses messaging states without sending anything', async () => {
  const calls = [];
  await assert.rejects(processJob({ id: 'job', lease_token: 'lease', status: 'discovered' }, { api: async body => calls.push(body), source: async () => { throw new Error('must not scan'); } }), /invalid_discovery_state/);
  assert.deepEqual(calls, []);
});
test('source failure is persisted once, without a local retry loop', async () => {
  const calls = [];
  await processJob({ id: 'job', lease_token: 'lease', status: 'running', source_url: 'https://www.yad2.co.il/realestate/item/abc123' }, { api: async body => calls.push(body), source: async () => { throw Object.assign(new Error('rate limited'), { status: 429, retryAfter: 180 }); } });
  assert.deepEqual(calls, [{ action: 'failure', job_id: 'job', lease_token: 'lease', status: 429, error: 'rate limited', retry_after: 180 }]);
});