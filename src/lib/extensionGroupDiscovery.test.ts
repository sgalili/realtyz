import { describe, expect, it, vi } from 'vitest';
import { joinGroupsViaExtension } from './extensionGroupDiscovery';

describe('per-group joining events', () => {
  const groups = [{ group_id: '123', group_name: 'קבוצה', group_url: 'https://www.facebook.com/groups/123' }];
  const emit = (requestId: string, payload: Record<string, unknown>, origin = window.location.origin) => {
    window.dispatchEvent(new MessageEvent('message', {
      source: window, origin,
      data: { source: 'realtyz-extension', type: 'RZ_FB_GROUP_JOIN_PROGRESS', requestId, ...payload },
    }));
  };

  it('reports actual starts and immediate individual results before batch completion', async () => {
    const progress = vi.fn();
    const run = joinGroupsViaExtension(groups, progress);
    emit(run.requestId, { groupId: '123', status: 'joining' });
    emit(run.requestId, { groupId: '123', status: 'joined' });
    expect(progress.mock.calls.map((c) => c.slice(0, 2))).toEqual([['123', 'joining'], ['123', 'joined']]);
    emit(run.requestId, { done: true });
    await run.done;
    emit(run.requestId, { groupId: '123', status: 'joining' });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('keeps approval requests distinct from confirmed membership', async () => {
    const progress = vi.fn();
    const run = joinGroupsViaExtension(groups, progress);
    emit(run.requestId, { groupId: '123', status: 'requested' });
    expect(progress).toHaveBeenCalledWith('123', 'requested', undefined);
    emit(run.requestId, { done: true });
    await run.done;
  });

  it('ignores foreign origins and unrelated requests', async () => {
    const progress = vi.fn();
    const run = joinGroupsViaExtension(groups, progress);
    emit(run.requestId, { groupId: '123', status: 'joined' }, 'https://other.example');
    emit('other-request', { groupId: '123', status: 'joined' });
    expect(progress).not.toHaveBeenCalled();
    emit(run.requestId, { done: true });
    await run.done;
  });
});