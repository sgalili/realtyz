// Ayrshare 429 guard + exponential backoff with a HARD retry cap.
//
// Usage:
//   const guard = createAyrshareBackoff();
//   const res = await guard.run(() => fetch(...));
//   if (guard.halted) break; // stop the whole batch, provider asked us to back off
//
// Rules enforced here:
//  - Max 2 retries per request (3 attempts total).
//  - Backoff starts at 15s and doubles (15s, 30s) — never tighter.
//  - Once a 429 survives the retry cap, the guard "halts": every later call in
//    the same invocation short-circuits instead of hammering the API.

export interface FetchLike {
  ok: boolean;
  status: number;
}

export interface AyrshareBackoff {
  halted: boolean;
  /** Runs `fn`, retrying only on HTTP 429, capped. Returns null when halted. */
  run<T extends FetchLike>(fn: () => Promise<T>): Promise<T | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAyrshareBackoff(opts?: {
  maxRetries?: number;
  baseDelayMs?: number;
}): AyrshareBackoff {
  const maxRetries = opts?.maxRetries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 15_000;

  const guard: AyrshareBackoff = {
    halted: false,
    async run<T extends FetchLike>(fn: () => Promise<T>): Promise<T | null> {
      if (guard.halted) return null;
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fn();
        if (res.status !== 429) return res;
        if (attempt >= maxRetries) {
          guard.halted = true;
          console.warn("[ayrshare-backoff] 429 retry cap reached — halting batch");
          return res;
        }
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[ayrshare-backoff] 429 — backing off ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        attempt += 1;
      }
    },
  };
  return guard;
}
