import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { fetchPublicBoardFeed } from './publicBoardFeed';
it('stops pagination when the service repeats a page', async () => {
  mocks.invoke.mockResolvedValue({ data: { properties: [{ id: 'a' }], has_more: true }, error: null });
  expect(await fetchPublicBoardFeed()).toEqual([{ id: 'a' }]);
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
});