import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkspaceInventoryCounts } from './useWorkspaceInventoryCounts';

const state = vi.hoisted(() => ({
  user: { id: 'viewer' } as { id: string } | null,
  rpc: vi.fn(),
}));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
afterEach(() => { cleanup(); state.rpc.mockReset(); state.user = { id: 'viewer' }; });

function setup(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useWorkspaceInventoryCounts(open), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

it.each([
  ['broker', 'properties', 13],
  ['developer', 'projects', 3],
  ['private-owner', 'properties', 0],
])('returns the server-authorized %s inventory count, including zero', async (owner, kind, count) => {
  state.rpc.mockResolvedValue({ data: [{ workspace_owner_id: owner, inventory_kind: kind, inventory_count: String(count) }], error: null });
  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(state.rpc).toHaveBeenCalledWith('get_workspace_inventory_counts');
  expect(result.current.data).toEqual([{ workspace_owner_id: owner, inventory_kind: kind, inventory_count: count }]);
});

it('does not request private counts for a signed-out visitor', () => {
  state.user = null;
  setup();
  expect(state.rpc).not.toHaveBeenCalled();
});

it('does not present failed reads as zero inventory', async () => {
  state.rpc.mockResolvedValue({ data: null, error: new Error('Denied') });
  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});