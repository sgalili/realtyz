import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceProvider, useWorkspace } from './useWorkspace';
const state = vi.hoisted(() => ({ user: { id: 'admin' } as { id: string } | null, resolve: null as ((value: unknown) => void) | null }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('./useAppMode', () => ({ writeAppMode: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: async (name: string) => name === 'get_my_workspaces' ? new Promise(resolve => { state.resolve = resolve; }) : { error: null },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { active_workspace_owner_id: 'partner' } }) }) }) }),
} }));
afterEach(() => { cleanup(); localStorage.clear(); state.user = { id: 'admin' }; state.resolve = null; });
it('hides cached tenant data until membership is verified', async () => {
  localStorage.setItem('realtyz-workspaces-cache:admin', JSON.stringify([{ workspace_owner_id: 'old', owner_full_name: 'old admin' }]));
  localStorage.setItem('realtyz-active-workspace:admin:last', 'old');
  const client = new QueryClient();
  const { result } = renderHook(() => useWorkspace(), { wrapper: ({ children }) => <QueryClientProvider client={client}><WorkspaceProvider>{children}</WorkspaceProvider></QueryClientProvider> });
  expect(result.current.activeWorkspaceId).toBeNull();
  expect(result.current.workspaces).toEqual([]);
  await waitFor(() => expect(state.resolve).not.toBeNull());
  await act(async () => { state.resolve?.({ data: [{ workspace_owner_id: 'partner', user_id: 'admin', is_self: false }], error: null }); });
  await waitFor(() => expect(result.current.activeWorkspaceId).toBe('partner'));
});
it('discards a delayed previous-account workspace response', async () => {
  const client = new QueryClient();
  const { result, rerender } = renderHook(() => useWorkspace(), { wrapper: ({ children }) => <QueryClientProvider client={client}><WorkspaceProvider>{children}</WorkspaceProvider></QueryClientProvider> });
  await waitFor(() => expect(state.resolve).not.toBeNull());
  const old = state.resolve;
  state.user = null;
  rerender();
  await act(async () => { old?.({ data: [{ workspace_owner_id: 'admin', user_id: 'admin', is_self: true }], error: null }); });
  expect(result.current.activeWorkspaceId).toBeNull();
  expect(result.current.workspaces).toEqual([]);
});