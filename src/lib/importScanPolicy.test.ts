import { describe, expect, it } from 'vitest';
import { canRetryDeveloperPage, IMPORT_DISCOVERY_BUDGET_MS, IMPORT_QUEUE_GAP_MS } from '../../supabase/functions/_shared/importScanPolicy';

describe('bounded import discovery', () => {
  it('limits slow source discovery to 50 seconds rather than two minutes', () => {
    expect(IMPORT_DISCOVERY_BUDGET_MS).toBe(50_000);
  });
  it('avoids the redundant twelve-second queue wait', () => {
    expect(IMPORT_QUEUE_GAP_MS).toBe(1_000);
  });
  it('stops retrying an unavailable developer page after three attempts', () => {
    expect([1, 2, 3, 4].map(canRetryDeveloperPage)).toEqual([true, true, false, false]);
  });
});