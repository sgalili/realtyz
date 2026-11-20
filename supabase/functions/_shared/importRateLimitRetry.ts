import { autonomousDeveloperCheckpoint, developerRetryDeadline } from './developerImportRetry.ts';

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
