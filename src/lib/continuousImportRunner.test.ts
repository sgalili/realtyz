import { afterEach, describe, expect, it, vi } from 'vitest';
import { startContinuousImportRunner } from './continuousImportRunner';

afterEach(() => vi.useRealTimers());
describe('continuous import runner', () => {
  it('continues after discovery through every page and stops only at completion', async () => {
    vi.useFakeTimers();
    const step = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ done: true });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const stop = startContinuousImportRunner({ step, refresh });
    await vi.runAllTimersAsync();
    expect(step).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });
  it('honors automatic provider retry deadlines without manual resume', async () => {
    vi.useFakeTimers();
    const step = vi.fn().mockResolvedValueOnce({ retry_in_ms: 300_000 }).mockResolvedValueOnce({ done: true });
    const stop = startContinuousImportRunner({ step, refresh: async () => {} });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(step).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(step).toHaveBeenCalledTimes(2);
    stop();
  });
  it('never overlaps steps and discards in-flight responses after scope cancellation', async () => {
    vi.useFakeTimers();
    let finish: ((result: {}) => void) | undefined;
    const step = vi.fn(() => new Promise<{}>(resolve => { finish = resolve; }));
    const refresh = vi.fn();
    const stop = startContinuousImportRunner({ step, refresh });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(step).toHaveBeenCalledTimes(1);
    stop();
    finish?.({});
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
    expect(step).toHaveBeenCalledTimes(1);
  });
  it('automatically retries transport errors without dropping page progress', async () => {
    vi.useFakeTimers();
    const step = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({ done: true });
    const stop = startContinuousImportRunner({ step, refresh: async () => {} });
    await vi.runAllTimersAsync();
    expect(step).toHaveBeenCalledTimes(2);
    stop();
  });
});