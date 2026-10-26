import { describe, expect, it } from 'vitest';
import { reorderItems } from './reorderItems';
describe('image sequence', () => {
  it('moves the first image to position three without losing images', () => {
    const original = ['cover', 'second', 'third', 'fourth'];
    expect(reorderItems(original, 0, 2)).toEqual(['second', 'third', 'cover', 'fourth']);
    expect(original).toEqual(['cover', 'second', 'third', 'fourth']);
  });
  it('moves the first image to position four and restores the cover', () => {
    expect(reorderItems(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(reorderItems(['b', 'c', 'd', 'a'], 3, 0)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignores out of bounds destinations', () => {
    const original = ['a', 'b'];
    expect(reorderItems(original, 0, 5)).toBe(original);
  });
});