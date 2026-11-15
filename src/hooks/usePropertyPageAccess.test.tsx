import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePropertyPageAccess } from './usePropertyPageAccess';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'signed-in-admin' }, loading: false }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'broker-workspace-owner' }));
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['managing_broker', 'super_admin'],
    loading: false,
    fetched: true,
    error: false,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('usePropertyPageAccess', () => {
  it('checks the active broker workspace owner instead of the signed-in administrator', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => usePropertyPageAccess(), { wrapper });

    await waitFor(() => expect(result.current.properties).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledWith('partner_can_view_closing', { _user_id: 'broker-workspace-owner' });
    expect(mocks.rpc).not.toHaveBeenCalledWith('partner_can_view_closing', { _user_id: 'signed-in-admin' });
  });
});
