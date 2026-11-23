import test from 'node:test';
import assert from 'node:assert/strict';
import { runScanner, scannerConfiguration } from './scanner.js';

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