import { describe, expect, it } from 'vitest';
import { BOARD_COLUMNS, upgradeBoardColumnOrder } from './PublicBoardTableControls';

describe('board column ordering', () => {
  it('retires the deal column and places commissions right after price', () => {
    const ids = BOARD_COLUMNS.map(column => column.id);
    expect(ids).not.toContain('deal');
    expect(ids.slice(ids.indexOf('price'), ids.indexOf('price') + 2)).toEqual(['price', 'commissions']);
  });
  it('upgrades existing preferences, dropping deal and inserting commissions after price', () => {
    expect(upgradeBoardColumnOrder(['photo', 'deal', 'address', 'price', 'rooms'] as never[])).toEqual(['photo', 'address', 'price', 'commissions', 'rooms']);
  });
  it('drops a saved deal column from customized orders', () => {
    expect(upgradeBoardColumnOrder(['commissions', 'deal', 'price', 'photo'] as never[])).toEqual(['commissions', 'price', 'photo']);
  });
});