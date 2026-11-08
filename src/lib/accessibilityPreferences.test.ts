import { describe, expect, it } from 'vitest';
import { normalizeAccessibility, DEFAULT_ACCESSIBILITY, ACCESSIBILITY_KEY, readAccessibility, saveAccessibility } from './accessibilityPreferences';
describe('accessibility preferences', () => {
  it('defaults all optional adjustments to off and text to 100%', () => {
    expect(normalizeAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY);
  });
  it('allows text up to 200% without shrinkage below the original', () => {
    expect(normalizeAccessibility({ textScale: 3 }).textScale).toBe(2);
    expect(normalizeAccessibility({ textScale: 0.5 }).textScale).toBe(1);
    expect(normalizeAccessibility({ textScale: 1.5 }).textScale).toBe(1.5);
  });
  it.each(['contrast', 'links', 'motion', 'readable', 'keyboard'])('persists %s independently', key => {
    localStorage.clear();
    saveAccessibility({ ...DEFAULT_ACCESSIBILITY, [key]: true });
    expect(readAccessibility()).toEqual({ ...DEFAULT_ACCESSIBILITY, [key]: true });
  });
  it('recovers from malformed saved settings', () => {
    localStorage.setItem(ACCESSIBILITY_KEY, 'not-json');
    expect(readAccessibility()).toEqual(DEFAULT_ACCESSIBILITY);
  });
});