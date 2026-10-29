import { afterEach, expect, it, vi } from 'vitest';
import { boundedRequest } from './boundedRequest';
afterEach(() => vi.useRealTimers());
it('finishes a stalled request instead of keeping loading forever', async () => {
  vi.useFakeTimers();
  const outcome = boundedRequest(new Promise(() => {})).catch(() => 'timed-out');
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await outcome).toBe('timed-out');
});
it('preserves a successful response', async () => expect(await boundedRequest(Promise.resolve(7))).toBe(7));