import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useAffiliateLicense } from './useAffiliateLicense';

const state = vi.hoisted(() => ({ owner: 'licensed-broker', loading: false, fail: false, rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'super-admin' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: state.owner, loading: state.loading }) }));
vi.mock('@/lib/brokerLicense', () => ({ verifyBrokerLicense: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: state.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
} }));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
afterEach(() => { client.clear(); state.owner = 'licensed-broker'; state.loading = false; state.fail = false; vi.clearAllMocks(); });
state.rpc.mockImplementation(async (_name, args) => ({ data: args._workspace_owner_id === 'licensed-broker', error: state.fail ? new Error('denied') : null }));

it('uses the server-authorized selected workspace, not the Super Admin identity', async () => {
  const { result } = renderHook(() => useAffiliateLicense(), { wrapper });
  await waitFor(() => expect(result.current.level4Unlocked).toBe(true));
  expect(state.rpc).toHaveBeenCalledWith('can_view_closing_prices', { _workspace_owner_id: 'licensed-broker' });
});
it('removes closing access on an unlicensed workspace switch and restores it on return', async () => {
  const { result, rerender } = renderHook(() => useAffiliateLicense(), { wrapper });
  await waitFor(() => expect(result.current.level4Unlocked).toBe(true));
  act(() => { state.owner = 'private-owner'; rerender(); });
  expect(result.current.level4Unlocked).toBe(false);
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('can_view_closing_prices', { _workspace_owner_id: 'private-owner' }));
  expect(result.current.level4Unlocked).toBe(false);
  act(() => { state.owner = 'licensed-broker'; rerender(); });
  await waitFor(() => expect(result.current.level4Unlocked).toBe(true));
});
it('hides old licensed results during the workspace handoff', async () => {
  const { result, rerender } = renderHook(() => useAffiliateLicense(), { wrapper });
  await waitFor(() => expect(result.current.level4Unlocked).toBe(true));
  act(() => { state.loading = true; rerender(); });
  expect(result.current.level4Unlocked).toBe(false);
});
it('fails closed when the server rejects the entitlement read', async () => {
  state.fail = true;
  const { result } = renderHook(() => useAffiliateLicense(), { wrapper });
  await waitFor(() => expect(state.rpc).toHaveBeenCalled());
  expect(result.current.level4Unlocked).toBe(false);
});