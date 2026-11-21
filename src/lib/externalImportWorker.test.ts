import { describe, expect, it } from 'vitest';
import { validExternalCounts, validWorkerCredential } from '../../supabase/functions/_shared/externalImportWorker';

describe('external worker boundary', () => {
  it('accepts only actual nonnegative integer progress fields', () => {
    expect(validExternalCounts({ brokers_done: 5, developers_done: 2, listings_done: 27, skipped: 3 })).toBe(true);
    expect(validExternalCounts({ listings_done: -1 })).toBe(false);
    expect(validExternalCounts({ brokers_done: 1.5 })).toBe(false);
    expect(validExternalCounts({ workspace_owner_id: 5 })).toBe(false);
    expect(validExternalCounts([])).toBe(false);
  });
  it('requires the separate worker credential, not a missing or short credential', () => {
    const testCredential = 'test-only-not-a-real-secret'.repeat(2);
    expect(validWorkerCredential(testCredential, testCredential)).toBe(true);
    expect(validWorkerCredential(testCredential, testCredential.slice(0, -1) + 'x')).toBe(false);
    expect(validWorkerCredential('', '')).toBe(false);
    expect(validWorkerCredential('short', 'short')).toBe(false);
  });
});