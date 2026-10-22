import { describe, expect, it } from 'vitest';
import { isReadyForBoard } from './readyForBoard';

describe('available properties ready for board publishing', () => {
  it('counts ready properties, excluding already published, discarded and incomplete ones', () => {
    const ready = { status: 'pending', city: 'חיפה', address: 'הרצל 10', asking_price: 1000000, is_published: false, affiliate_enabled: false };
    const rows = [ready, { ...ready, status: 'live', is_published: true, affiliate_enabled: true },
      { ...ready, status: 'discarded' }, { ...ready, city: ' ' }, { ...ready, address: '' }, { ...ready, asking_price: 0 }];
    expect(rows.filter(isReadyForBoard)).toEqual([ready]);
    expect(rows.filter(isReadyForBoard)).toHaveLength(1);
  });
});