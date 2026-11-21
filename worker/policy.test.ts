import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelay, configuration } from './policy.ts';
test('retry waits are persisted with a three-minute maximum', () => {
  assert.equal(retryDelay(1),15000);
  assert.equal(retryDelay(8),120000);
  assert.equal(retryDelay(2,1000000),180000);
});
test('worker cannot start with missing credentials or an insecure endpoint', () => {
  assert.throws(()=>configuration({}),/TORAFF_IMPORT_API_URL/);
  assert.throws(()=>configuration({TORAFF_IMPORT_API_URL:'http://example.test',IMPORT_WORKER_SHARED_SECRET:'test',BRIGHT_DATA_API_KEY:'test',BRIGHTDATA_UNLOCKER_ZONE:'test'}),/HTTPS/);
});