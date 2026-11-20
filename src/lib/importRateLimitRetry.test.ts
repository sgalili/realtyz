import { describe, expect, it } from 'vitest';
import { scheduleImportRateLimitRetry } from '../../supabase/functions/_shared/importRateLimitRetry';

describe('automatic import retry after provider 429', () => {
  it('keeps a discovered broker import running and schedules the five-minute retry', () => {
    const checkpoint = { source: 'agencies', phase: 'enriching' };
    const retry = scheduleImportRateLimitRetry(checkpoint, 0, 1_000);
    expect(retry).toMatchObject({ attempt: 1, retryAt: 301_000, waitScope: 'broker' });
    expect(retry.savePatch).toEqual({ status: 'running', error: null });
    expect(checkpoint).toMatchObject({ waitReason: 'rate_limit', waitUntil: 301_000, waitScope: 'broker' });
  });

  it('also auto-retries pasted broker links without marking them as developer work', () => {
    const checkpoint = { source: 'urls', phase: 'validating', totalDeveloperUrls: 0 };
    const retry = scheduleImportRateLimitRetry(checkpoint, 0, 1_000);
    expect(retry.waitScope).toBe('broker');
    expect(retry.savePatch.status).toBe('running');
  });

  it('preserves developer retry scope and honors a longer provider delay', () => {
    const checkpoint = { source: 'urls', phase: 'developer_scanning', totalDeveloperUrls: 1 };
    const retry = scheduleImportRateLimitRetry(checkpoint, 900_000, 1_000);
    expect(retry).toMatchObject({ retryAt: 901_000, waitScope: 'developer' });
  });
});
