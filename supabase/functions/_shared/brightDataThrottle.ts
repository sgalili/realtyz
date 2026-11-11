export const PROVIDER_GAP_MS = 4_000;
export const MAX_AUTOMATIC_RATE_RETRIES = 5;

export class ProviderRateLimitError extends Error {
  constructor(public retryAfterMs = 0) { super('Bright Data HTTP 429'); this.name = 'ProviderRateLimitError'; }
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now) || 0;
}

export function rateBackoffMs(attempt: number, providerDelay = 0): number {
  return Math.max(Math.min(60_000, 10_000 * 2 ** Math.max(0, attempt - 1)), providerDelay);
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