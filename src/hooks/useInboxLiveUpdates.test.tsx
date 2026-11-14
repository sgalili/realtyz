import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInboxLiveUpdates } from './useInboxLiveUpdates';

const mocks = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

describe('private inbox live updates', () => {
  beforeEach(() => vi.clearAllMocks());
  it('refetches both conversation types on a data-free private event and removes the subscription', () => {
    let changed = () => {};
    const channel = { on: vi.fn((_type, filter, callback) => { if (filter.event === 'changed') changed = callback; return channel; }), subscribe: vi.fn(() => channel) };
    mocks.channel.mockReturnValue(channel);
    const { unmount } = renderHook(() => useInboxLiveUpdates('agent-id'));
    expect(mocks.channel).toHaveBeenCalledWith('inbox-events:agent-id', { config: { private: true } });
    expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'changed' }, expect.any(Function));
    changed();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat-messages'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['community-messages'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat-receipts'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['community-preview-messages'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['community-group-messages'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['community-groups'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['community-roster'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rita-conversations'] });
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
  it('does not subscribe without an authenticated account', () => {
    renderHook(() => useInboxLiveUpdates(undefined));
    expect(mocks.channel).not.toHaveBeenCalled();
  });
  it('receipt events immediately refetch receipts without refetching messages or reacknowledging them', () => {
    let received = () => {};
    const channel = { on: vi.fn((_type, filter, callback) => { if (filter.event === 'receipt_changed') received = callback; return channel; }), subscribe: vi.fn(() => channel) };
    mocks.channel.mockReturnValue(channel);
    renderHook(() => useInboxLiveUpdates('agent-id'));
    received();
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat-receipts', 'agent-id'] });
  });
});