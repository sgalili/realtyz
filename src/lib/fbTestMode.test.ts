import { describe, it, expect } from 'vitest';
import { clampToTestTarget } from './fbTestMode';

describe('clampToTestTarget', () => {
  const t = { id: 'g1', name: 'x', url: null };
  it('keeps ids untouched when off', () => {
    expect(clampToTestTarget(['a', 'b'], { enabled: false, target: t, queueRowId: null })).toEqual(['a', 'b']);
  });
  it('allows only the single test group when on', () => {
    expect(clampToTestTarget(['a', 'g1', 'b'], { enabled: true, target: t, queueRowId: null })).toEqual(['g1']);
  });
  it('blocks everything when on without a target', () => {
    expect(clampToTestTarget(['a'], { enabled: true, target: null, queueRowId: null })).toEqual([]);
  });
});
