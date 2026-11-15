import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useListingProfileTargets } from './useListingProfileTargets';

const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [{ profile_user_id: 'broker', office_user_id: 'broker' }], error: null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

it('resolves public listing identity for an anonymous visitor', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const id = '1ca89c52-2163-4fe0-9ec1-3d27795b6232';
  const { result } = renderHook(() => useListingProfileTargets(id), { wrapper });
  await waitFor(() => expect(result.current.data?.profile_user_id).toBe('broker'));
  expect(rpc).toHaveBeenCalledWith('get_listing_profile_targets', { _listing_ids: [id] });
});