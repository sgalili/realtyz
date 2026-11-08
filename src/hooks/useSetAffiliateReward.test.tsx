import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useSetAffiliateReward } from './useAffiliate';

const state = vi.hoisted(() => ({ admin: true, row: { id: 'listing', workspace_owner_id: 'saved-workspace', user_id: 'publisher', owner_id: 'publisher' }, filters: [] as [string, unknown][], updates: 0 }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: state.admin }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'active-workspace' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  select: () => { const read = { eq: () => read, single: async () => ({ data: state.row, error: null }) }; return read; },
  update: () => { state.updates++; const write = { eq: (key: string, value: unknown) => { state.filters.push([key, value]); return write; }, select: () => write, single: async () => ({ data: { id: 'listing' }, error: null }) }; return write; },
}) } }));

describe('reward price workspace saving', () => {
  beforeEach(() => { state.admin = true; state.filters = []; state.updates = 0; });
  const input = { listingId: 'listing', enabled: true, rewardType: 'fixed' as const, rewardAmount: 0, tier1Amount: 40, tier4Type: 'percent' as const, tier4Amount: 1 };
  const setup = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return renderHook(() => useSetAffiliateReward(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  };
  it('saves the selected ad in its saved workspace, not the Super Admin workspace', async () => {
    const { result } = setup();
    await act(async () => { await result.current.mutateAsync(input); });
    expect(state.filters).toEqual([['id', 'listing'], ['workspace_owner_id', 'saved-workspace']]);
  });
  it('never writes a foreign workspace ad for an unauthorized user', async () => {
    state.admin = false;
    const { result } = setup();
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('אין הרשאה'); });
    expect(state.updates).toBe(0);
  });
});