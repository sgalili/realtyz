import { describe, expect, it } from 'vitest';
import { scheduleImportRateLimitRetry, scheduleImportTransientRetry } from '../../supabase/functions/_shared/importRateLimitRetry';

describe('automatic import retry after provider 429', () => {
  it('keeps a discovered broker import running and schedules a short 15-second retry', () => {
    const checkpoint = { source: 'agencies', phase: 'enriching' };
    const retry = scheduleImportRateLimitRetry(checkpoint, 0, 1_000);
    expect(retry).toMatchObject({ attempt: 1, retryAt: 16_000, waitScope: 'broker' });
    expect(retry.savePatch).toEqual({ status: 'running', error: null });
    expect(checkpoint).toMatchObject({ waitReason: 'rate_limit', waitUntil: 16_000, waitScope: 'broker' });
  });

  it('also auto-retries pasted broker links without marking them as developer work', () => {
    const checkpoint = { source: 'urls', phase: 'validating', totalDeveloperUrls: 0 };
    const retry = scheduleImportRateLimitRetry(checkpoint, 0, 1_000);
    expect(retry.waitScope).toBe('broker');
    expect(retry.savePatch.status).toBe('running');
  });

  it('preserves developer retry scope and caps a long provider delay at 3 minutes', () => {
    const checkpoint = { source: 'urls', phase: 'developer_scanning', totalDeveloperUrls: 1 };
    const retry = scheduleImportRateLimitRetry(checkpoint, 900_000, 1_000);
    expect(retry).toMatchObject({ retryAt: 181_000, waitScope: 'developer' });
  });

  it('labels temporary connection failures separately from 429 and keeps their own short counter', () => {
    const checkpoint: Record<string, any> = { source: 'agencies', phase: 'creating', rateRetries: 3 };
    const retry = scheduleImportTransientRetry(checkpoint, 1_000);
    expect(retry).toMatchObject({ attempt: 1, retryAt: 6_000, waitScope: 'broker' });
    expect(checkpoint).toMatchObject({ waitReason: 'transient_retry', transientRetries: 1, rateRetries: 3 });
  });
});
