import { describe, expect, it } from 'vitest';
import { BOARD_COLUMNS, upgradeBoardColumnOrder } from './PublicBoardTableControls';

describe('board column ordering', () => {
  it('places commissions between price and deal by default', () => {
    const ids = BOARD_COLUMNS.map(column => column.id);
    expect(ids.slice(ids.indexOf('price'), ids.indexOf('price') + 3)).toEqual(['price', 'commissions', 'deal']);
  });
  it('upgrades existing preferences without losing unrelated order', () => {
    expect(upgradeBoardColumnOrder(['photo', 'deal', 'address', 'price', 'rooms'])).toEqual(['photo', 'address', 'price', 'commissions', 'deal', 'rooms']);
  });
  it('preserves subsequent customized column order', () => {
    const order = ['commissions', 'deal', 'price', 'photo'] as const;
    expect(upgradeBoardColumnOrder([...order])).toEqual(order);
  });
});