import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRitaWorkspaceIdentity } from './useRitaWorkspaceIdentity';

const state = vi.hoisted(() => ({ user: 'super-admin', owner: 'shafi', loading: false, pending: false }));
const rows = vi.hoisted(() => ({
  shafi: { id: 'shafi', full_name: 'שפי ישראלי', gender: 'female' },
  broker: { id: 'broker', full_name: 'אודי ויטמן', gender: 'male' },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: state.user } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: state.owner, loading: state.loading }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_: string, id: keyof typeof rows) => ({ abortSignal: () => ({ maybeSingle: () => state.pending ? new Promise(() => {}) : Promise.resolve({ data: rows[id], error: null }) }) }) }) }),
  rpc: (_: string, { _owner }: { _owner: string }) => ({ abortSignal: () => Promise.resolve({ data: _owner === 'shafi' ? ['affiliate'] : ['managing_broker'], error: null }) }),
} }));
beforeEach(() => { state.user = 'super-admin'; state.owner = 'shafi'; state.loading = false; state.pending = false; });
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useRitaWorkspaceIdentity(), { wrapper: ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> });
}
it('reads Shafi exact name, female gender and affiliate role, not the Super Admin', async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.name).toBe('שפי ישראלי');
  expect(hook.result.current.gender).toBe('female');
  expect(hook.result.current.roles).toEqual(['affiliate']);
  expect(hook.result.current.scope).toBe('super-admin:shafi');
});
it('clears identity immediately during handoff, then loads only the new owner', async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => { state.loading = true; hook.rerender(); });
  expect(hook.result.current.name).toBe('');
  expect(hook.result.current.roles).toEqual([]);
  expect(hook.result.current.gender).toBe(null);
  expect(hook.result.current.scope).toBe('');
  act(() => { state.loading = false; state.owner = 'broker'; hook.rerender(); });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.name).toBe('אודי ויטמן');
  expect(hook.result.current.roles).toEqual(['managing_broker']);
});
it('does not restore a cached identity across accounts while the new read is pending', async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => { state.user = 'new-account'; state.pending = true; hook.rerender(); });
  expect(hook.result.current.scope).toBe('new-account:shafi');
  expect(hook.result.current.name).toBe('');
  expect(hook.result.current.ready).toBe(false);
});