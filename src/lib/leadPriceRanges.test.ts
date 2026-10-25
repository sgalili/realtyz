import { describe, expect, it } from 'vitest';
import { clampLeadPrice, closingLevelClass, closingLevelColor, closingRewardLevel } from './leadPriceRanges';
describe('lead price ranges', () => {
  it('form fill is 40-150', () => { expect(clampLeadPrice('form', 10)).toBe(40); expect(clampLeadPrice('form', 999)).toBe(150); });
  it('whatsapp filter is 50-200', () => { expect(clampLeadPrice('whatsapp', 0)).toBe(50); expect(clampLeadPrice('whatsapp', 500)).toBe(200); });
  it('phone filter is 80-250', () => { expect(clampLeadPrice('phone', 1)).toBe(80); expect(clampLeadPrice('phone', 300)).toBe(250); });
});
describe('closing reward color level', () => {
  // Mirrors the server expectation in src/lib/publicListingVisibility.test.ts: a 1.5%
  // sale closing fee sits at level 2, so the restricted trophy keeps that same color.
  it('matches the server level for a 1.5% sale closing fee', () => {
    expect(closingRewardLevel(1.5, 'percent', 'sale', 3_000_000)).toBe(2);
    expect(closingRewardLevel(0.2, 'percent', 'sale', 3_000_000)).toBe(0);
    expect(closingRewardLevel(2, 'percent', 'sale', 3_000_000)).toBe(3);
    expect(closingRewardLevel(50, 'percent', 'rent', 7_000)).toBe(1);
    expect(closingRewardLevel(0, 'fixed', 'sale', 3_000_000)).toBeNull();
    expect(closingRewardLevel(100000, 'fixed', 'sale', 0)).toBeNull();
  });
  it('maps each level onto its cold→hot token', () => {
    expect(closingLevelColor(0)).toBe('hsl(var(--closing-low))');
    expect(closingLevelColor(1)).toBe('hsl(var(--closing-medium))');
    expect(closingLevelColor(2)).toBe('hsl(var(--closing-high))');
    expect(closingLevelColor(3)).toBe('hsl(var(--closing-max))');
    expect(closingLevelColor(null)).toBeUndefined();
  });
  it('exposes each level as its color class', () => {
    expect(closingLevelClass(0)).toBe('closing-level-0');
    expect(closingLevelClass(3)).toBe('closing-level-3');
    expect(closingLevelClass(null)).toBeUndefined();
  });
});
