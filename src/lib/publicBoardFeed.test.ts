import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { fetchPublicBoardFeed } from './publicBoardFeed';
it('stops pagination when the service repeats a page', async () => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: { properties: [{ id: 'a' }], has_more: true }, error: null });
  expect(await fetchPublicBoardFeed()).toEqual([{ id: 'a' }]);
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
});
it('continues through an empty eligible page when the server has more records', async () => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValueOnce({ data: { properties: [], has_more: true }, error: null })
    .mockResolvedValueOnce({ data: { properties: [{ id: 'later' }], has_more: false }, error: null });
  expect(await fetchPublicBoardFeed()).toEqual([{ id: 'later' }]);
  expect(mocks.invoke.mock.calls[1][0]).toContain('offset=60');
});