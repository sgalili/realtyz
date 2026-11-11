export const PROVIDER_GAP_MS = 12_000;
export const MIN_RATE_COOLDOWN_MS = 300_000;

export class ProviderRateLimitError extends Error {
  constructor(public retryAfterMs = 0) { super('Bright Data HTTP 429'); this.name = 'ProviderRateLimitError'; }
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now) || 0;
}

export function rateBackoffMs(attempt: number, providerDelay = 0): number {
  return Math.max(Math.min(3_600_000, MIN_RATE_COOLDOWN_MS * 2 ** Math.max(0, attempt - 1)), providerDelay);
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