export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Reserve slots synchronously: parallel callers cannot all start after the same sleep. */
export class RequestGate {
  private next = 0;
  private cooldown = 0;
  constructor(private interval: number, private now = Date.now, private wait = delay) {}
  defer(ms: number) { this.cooldown = Math.max(this.cooldown, this.now() + ms); }
  async enter() {
    const slot = Math.max(this.now(), this.next, this.cooldown);
    this.next = slot + this.interval;
    await this.wait(Math.max(0, slot - this.now()));
    // A provider cooldown may have arrived while this request waited for its slot.
    if (slot < this.cooldown) await this.enter();
  }
}

/** Fetch concurrently, commit serially as each result arrives, then report failures.
 * Every successful commit finishes even if a sibling source request fails.
 */
export async function readAndCommit<T>(items: string[], read: (url: string) => Promise<T>, commit: (url: string, value: T) => Promise<void>) {
  let chain = Promise.resolve();
  let commitFailed = false;
  const results = await Promise.allSettled(items.map(async url => {
    const value = await read(url);
    const save = chain.then(async () => {
      if (commitFailed) throw new Error('Earlier checkpoint save failed');
      try { await commit(url, value); } catch (error) { commitFailed = true; throw error; }
    });
    chain = save.catch(() => {});
    await save;
  }));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const suspended = failures.find(r => r.reason?.status === 407);
  if (suspended) throw suspended.reason;
  if (failures.length) throw failures[0].reason;
}
/** Pick inventory before more identities; keep active cursor and the remaining backlog intact. */
export function activatePendingInventory<T>(c: { activeBroker?: T | null; workerEnrichment: T[] }) {
  if (!c.activeBroker) c.activeBroker = c.workerEnrichment.shift() ?? null;
  return c.activeBroker;
}
