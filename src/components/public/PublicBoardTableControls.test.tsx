import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BOARD_COLUMNS, usePublicBoardColumns } from './PublicBoardTableControls';
afterEach(() => { cleanup(); localStorage.clear(); });
it('restores public-board default order while retaining hidden columns and sorting', () => {
  const key = 'public-board-columns:v1:order-test';
  localStorage.setItem(key, JSON.stringify({ order: [...BOARD_COLUMNS].reverse().map(c => c.id), hidden: ['photo'], sort: { id: 'price', descending: true } }));
  const { result } = renderHook(() => usePublicBoardColumns('order-test', []));
  act(() => result.current.resetOrder());
  expect(result.current.visible).toEqual(BOARD_COLUMNS.filter(c => c.id !== 'photo').map(c => c.id));
  expect(result.current.sort).toEqual({ id: 'price', descending: true });
});