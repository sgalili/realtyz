import { describe, expect, it } from 'vitest';
import { autonomousDeveloperCheckpoint, developerRetryDeadline, transientRetryBackoffMs } from '../../supabase/functions/_shared/developerImportRetry';

describe('autonomous developer import retries', () => {
  it('applies only to the developer portion of an explicit-link job', () => {
    expect(autonomousDeveloperCheckpoint({ source: 'urls', totalDeveloperUrls: 1, phase: 'developer_scanning' })).toBe(true);
    expect(autonomousDeveloperCheckpoint({ source: 'urls', totalDeveloperUrls: 1, phase: 'enriching', waitScope: 'developer' })).toBe(true);
    expect(autonomousDeveloperCheckpoint({ source: 'urls', totalDeveloperUrls: 0, phase: 'developer_scanning' })).toBe(false);
    expect(autonomousDeveloperCheckpoint({ source: 'agencies', totalDeveloperUrls: 1, phase: 'developer_scanning' })).toBe(false);
    expect(autonomousDeveloperCheckpoint({ source: 'urls', totalDeveloperUrls: 1, phase: 'enriching' })).toBe(false);
  });

  it('backs off temporary failures without requiring a Continue action', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(transientRetryBackoffMs)).toEqual([5000, 15000, 30000, 60000, 120000, 120000, 120000]);
    expect(developerRetryDeadline('transient_retry', 2, 1000)).toBe(16000);
  });

  it('retains the full provider 429 cooldown and Retry-After deadline', () => {
    expect(developerRetryDeadline('rate_limit', 1, 1000)).toBe(16000);
    expect(developerRetryDeadline('rate_limit', 1, 1000, 900000)).toBe(181000);
  });
});
