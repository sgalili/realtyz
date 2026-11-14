import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useChatReceipts } from './useChatReceipts';
const rpc = vi.hoisted(() => vi.fn(async (_name: string, _args: unknown) => ({ data: [], error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { id: 'self' } }) }));
vi.mock('./useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace' }));
const id = '11111111-1111-4111-8111-111111111111';
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('fetching an incoming preview acknowledges delivery but never reading', async () => {
 renderHook(() => useChatReceipts('peer', [{ id, incoming: true }], false), { wrapper });
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('acknowledge_chat_messages', { _kind: 'peer', _ids: [id], _read: false }));
});
it('only the visible open chat acknowledges a read', async () => {
 vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
 renderHook(() => useChatReceipts('peer', [{ id, incoming: true }], true), { wrapper });
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('acknowledge_chat_messages', { _kind: 'peer', _ids: [id], _read: true }));
 vi.restoreAllMocks();
});
it('an inactive or hidden chat cannot produce blue ticks', async () => {
 vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
 renderHook(() => useChatReceipts('group', [{ id, incoming: true }], true), { wrapper });
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('acknowledge_chat_messages', { _kind: 'group', _ids: [id], _read: false }));
 vi.restoreAllMocks();
});
it('a sender cannot acknowledge delivery or reading for the recipient', async () => {
 renderHook(() => useChatReceipts('peer', [{ id, incoming: false }], true), { wrapper });
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('chat_receipt_states', { _kind: 'peer', _ids: [id] }));
 expect(rpc.mock.calls.some(call => call[0] === 'acknowledge_chat_messages')).toBe(false);
});