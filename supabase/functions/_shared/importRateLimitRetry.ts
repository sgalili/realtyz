import { autonomousDeveloperCheckpoint, developerRetryDeadline, DEVELOPER_TRANSIENT_RETRY } from './developerImportRetry.ts';

export const MAX_TRANSIENT_IMPORT_RETRIES = 8;

/** Save a resumable running checkpoint; the database wake-up trigger schedules its next step. */
export function scheduleImportRateLimitRetry(
  checkpoint: Record<string, any>,
  providerDelay = 0,
  now = Date.now(),
) {
  const waitScope = autonomousDeveloperCheckpoint(checkpoint) ? 'developer' : 'broker';
  const attempt = Number(checkpoint.rateRetries ?? 0) + 1;
  const retryAt = developerRetryDeadline('rate_limit', attempt, now, providerDelay);
  Object.assign(checkpoint, {
    rateRetries: attempt,
    waitScope,
    waitReason: 'rate_limit',
    waitUntil: retryAt,
  });
  return { attempt, retryAt, waitScope, savePatch: { status: 'running' as const, error: null } };
}

/** Temporary worker/network failure (not a 429): its own short counter and label, so the UI never shows it as a rate limit. */
export function scheduleImportTransientRetry(checkpoint: Record<string, any>, now = Date.now()) {
  const waitScope = autonomousDeveloperCheckpoint(checkpoint) ? 'developer' : 'broker';
  const attempt = Number(checkpoint.transientRetries ?? 0) + 1;
  const retryAt = developerRetryDeadline(DEVELOPER_TRANSIENT_RETRY, attempt, now);
  Object.assign(checkpoint, { transientRetries: attempt, waitScope, waitReason: DEVELOPER_TRANSIENT_RETRY, waitUntil: retryAt });
  return { attempt, retryAt, waitScope, savePatch: { status: 'running' as const, error: null } };
}
