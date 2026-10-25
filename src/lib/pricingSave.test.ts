import { describe, expect, it, vi } from 'vitest';
import { commitPricingEdit, pricingEditWorkspace } from './pricingSave';

describe('rewards editor save', () => {
  it('targets the listing workspace for a cross-workspace Super Admin edit', () => {
    expect(pricingEditWorkspace({ workspace_owner_id: 'ad-workspace', user_id: 'poster' }, 'admin', 'admin-workspace', true)).toBe('ad-workspace');
  });
  it('rejects an unrelated workspace edit by a non-admin', () => {
    expect(pricingEditWorkspace({ workspace_owner_id: 'ad-workspace', user_id: 'poster' }, 'visitor', 'visitor-workspace', false)).toBeNull();
  });
  it('allows the owner and active workspace member to target the saved ad workspace', () => {
    expect(pricingEditWorkspace({ workspace_owner_id: 'ad-workspace', user_id: 'poster' }, 'poster', 'other', false)).toBe('ad-workspace');
    expect(pricingEditWorkspace({ workspace_owner_id: 'ad-workspace' }, 'member', 'ad-workspace', false)).toBe('ad-workspace');
  });
  it('closes the editor after a committed write even when the cache refresh fails', async () => {
    const order: string[] = [];
    const outcome = await commitPricingEdit({
      commit: async () => { order.push('write'); return { id: 'L1' }; },
      onCommitted: () => { order.push('close'); },
      refresh: async () => { throw new Error('public-listing-view unavailable'); },
    });

    expect(outcome.committed).toBe(true);
    expect(order).toEqual(['write', 'close']);
  });

  it('refreshes caches after closing the editor', async () => {
    const order: string[] = [];
    await commitPricingEdit({
      commit: async () => 'row',
      onCommitted: () => { order.push('close'); },
      refresh: async () => { order.push('refresh'); },
    });

    expect(order).toEqual(['close', 'refresh']);
  });

  it('keeps the editor open and reports failure when the write itself fails', async () => {
    const onCommitted = vi.fn();
    const refresh = vi.fn();
    const outcome = await commitPricingEdit({
      commit: async () => { throw new Error('row not updated'); },
      onCommitted,
      refresh,
    });

    expect(outcome.committed).toBe(false);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
