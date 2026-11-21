import { rateBackoffMs } from './brightDataThrottle.ts';

export const DEVELOPER_TRANSIENT_RETRY = 'transient_retry';

/** Only the developer portion of an explicit-link job is fully autonomous. */
export function autonomousDeveloperCheckpoint(checkpoint: Record<string, any> | null | undefined): boolean {
  if (!checkpoint || checkpoint.source !== 'urls' || Number(checkpoint.totalDeveloperUrls ?? 0) < 1) return false;
  return String(checkpoint.phase ?? '').startsWith('developer_') || checkpoint.waitScope === 'developer';
}

/** Short, bounded exponential delays for timeouts and temporary gateway failures. */
export function transientRetryBackoffMs(attempt: number): number {
  const delays = [5_000, 15_000, 30_000, 60_000, 120_000];
  return delays[Math.min(delays.length - 1, Math.max(0, Math.trunc(attempt) - 1))];
}

export function developerRetryDeadline(kind: 'rate_limit' | typeof DEVELOPER_TRANSIENT_RETRY, attempt: number, now = Date.now(), providerDelay = 0): number {
  return now + (kind === 'rate_limit' ? rateBackoffMs(attempt, providerDelay) : transientRetryBackoffMs(attempt));
}
