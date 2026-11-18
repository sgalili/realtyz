import { expect, it, vi } from 'vitest';
import { readAllRows } from '../../supabase/functions/_shared/readAllRows';

it('counts all 1026 saved projects without the API row cap', async () => {
  const saved = Array.from({ length: 1026 }, (_, id) => ({ id }));
  const load = vi.fn(async (from: number, to: number) => ({ data: saved.slice(from, to + 1), error: null }));
  expect(await readAllRows(load)).toHaveLength(1026);
  expect(load).toHaveBeenCalledTimes(3);
});
it('does not turn a failed count read into zero', async () => {
  await expect(readAllRows(async () => ({ data: null, error: new Error('unavailable') }))).rejects.toThrow('unavailable');
});