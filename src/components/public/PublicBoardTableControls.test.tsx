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
  expect(result.current.visible).toEqual([...BOARD_COLUMNS].reverse().filter(c => c.id !== 'publish').map(c => c.id));
  act(() => result.current.toggleSort('price'));
  expect(result.current.sort).toEqual({ id: 'price', descending: false });
});
it('restores public-board default order while retaining hidden columns and sorting', () => {
  const key = 'public-board-columns:v1:order-test';
  localStorage.setItem(key, JSON.stringify({ order: [...BOARD_COLUMNS].reverse().map(c => c.id), hidden: ['photo'], sort: { id: 'price', descending: true } }));
  const { result } = renderHook(() => usePublicBoardColumns('order-test', []));
  act(() => result.current.resetOrder());
  expect(result.current.visible).toEqual(BOARD_COLUMNS.filter(c => c.id !== 'photo' && c.id !== 'publish').map(c => c.id));
  expect(result.current.sort).toEqual({ id: 'price', descending: true });
});
it('excludes publication controls from public definitions even with saved publication preferences', () => {
  localStorage.setItem('public-board-columns:v1:public-test', JSON.stringify({ order: BOARD_COLUMNS.map(c => c.id), hidden: [] }));
  const { result } = renderHook(() => usePublicBoardColumns('public-test', []));
  expect(result.current.definitions.some(c => c.id === 'publish')).toBe(false);
  expect(result.current.visible).not.toContain('publish');
  act(() => result.current.reset());
  expect(result.current.visible).not.toContain('publish');
});
it('retains publication controls when explicitly configured for property management', () => {
  const { result } = renderHook(() => usePublicBoardColumns('managed-test', [], { columns: [...BOARD_COLUMNS], value: () => null }));
  expect(result.current.visible[0]).toBe('publish');
  expect(result.current.definitions.some(c => c.id === 'publish')).toBe(true);
});