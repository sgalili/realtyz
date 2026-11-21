export const PROVIDER_GAP_MS = 12_000;
// 429 waits stay short and bounded: 15s → 2 min; a provider Retry-After is honoured only up to 3 min.
export const MIN_RATE_COOLDOWN_MS = 15_000;
export const MAX_RATE_COOLDOWN_MS = 120_000;
export const MAX_PROVIDER_RETRY_AFTER_MS = 180_000;
const RATE_STEPS_MS = [15_000, 30_000, 60_000, 90_000, 120_000];
// Adaptive queue gap between provider requests: grows after a 429, decays back after successes.
export const MAX_PACE_GAP_MS = 15_000;

export class ProviderRateLimitError extends Error {
  constructor(public retryAfterMs = 0) { super('Bright Data HTTP 429'); this.name = 'ProviderRateLimitError'; }
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now) || 0;
}

export function rateBackoffMs(attempt: number, providerDelay = 0): number {
  const base = RATE_STEPS_MS[Math.min(RATE_STEPS_MS.length - 1, Math.max(0, Math.trunc(attempt) - 1))];
  return Math.max(base, Math.min(MAX_PROVIDER_RETRY_AFTER_MS, Math.max(0, providerDelay || 0)));
}

export function adaptPaceGap(current: unknown, event: 'rate_limit' | 'success', floor: number): number {
  const gap = Math.max(floor, Number(current) || 0);
  if (event === 'rate_limit') return Math.min(MAX_PACE_GAP_MS, Math.max(3_000, gap * 2));
  return gap <= floor ? floor : Math.max(floor, Math.round(gap * 0.8));
}

export function rateCooldownRemaining(checkpoint: {waitReason?: unknown; waitUntil?: unknown}, now = Date.now()): number {
  return checkpoint.waitReason === 'rate_limit' ? Math.max(0, Number(checkpoint.waitUntil ?? 0) - now) : 0;
}

// One in-flight request per isolate, with a gap after completion, including failures.
export function createProviderPacer(now = Date.now, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  let tail: Promise<unknown> = Promise.resolve();
  let nextAt = 0;
  return function paced<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      const delay = Math.max(0, nextAt - now());
      if (delay) await sleep(delay);
      try { return await operation(); } finally { nextAt = now() + PROVIDER_GAP_MS; }
    });
    tail = result.catch(() => {});
    return result;
  };
}