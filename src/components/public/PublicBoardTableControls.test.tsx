import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BOARD_COLUMNS, usePublicBoardColumns } from './PublicBoardTableControls';
afterEach(() => { cleanup(); localStorage.clear(); });
it('never sorts rewards, including saved legacy preferences, but preserves reordering', () => {
  localStorage.setItem('public-board-columns:v1:reward-test', JSON.stringify({ order: [...BOARD_COLUMNS].reverse().map(c => c.id), hidden: [], sort: { id: 'commissions', descending: true } }));
  const { result } = renderHook(() => usePublicBoardColumns('reward-test', []));
  expect(result.current.sort).toBeNull();
  act(() => result.current.toggleSort('commissions'));
  expect(result.current.sort).toBeNull();
  expect(result.current.visible).toEqual([...BOARD_COLUMNS].reverse().map(c => c.id));
  act(() => result.current.toggleSort('price'));
  expect(result.current.sort).toEqual({ id: 'price', descending: false });
});
it('restores public-board default order while retaining hidden columns and sorting', () => {
  const key = 'public-board-columns:v1:order-test';
  localStorage.setItem(key, JSON.stringify({ order: [...BOARD_COLUMNS].reverse().map(c => c.id), hidden: ['photo'], sort: { id: 'price', descending: true } }));
  const { result } = renderHook(() => usePublicBoardColumns('order-test', []));
  act(() => result.current.resetOrder());
  expect(result.current.visible).toEqual(BOARD_COLUMNS.filter(c => c.id !== 'photo').map(c => c.id));
  expect(result.current.sort).toEqual({ id: 'price', descending: true });
});