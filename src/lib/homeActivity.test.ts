import { describe, expect, it } from 'vitest';
import { hasHomeActivity, listingDistribution } from './homeActivity';

describe('unified home activity', () => {
  it('hides stats when all four personal metrics are zero', () => {
    expect(hasHomeActivity({ properties: 0, leads: 0, marketing: 0, earnings: 0 })).toBe(false);
  });
  it.each(['properties', 'leads', 'marketing', 'earnings'] as const)('shows activity for nonzero %s', key => {
    expect(hasHomeActivity({ properties: 0, leads: 0, marketing: 0, earnings: 0, [key]: 1 })).toBe(true);
  });
  it('distinguishes network listings from site-only listings', () => {
    expect(listingDistribution(true)).toBe('network');
    expect(listingDistribution(false)).toBe('site');
  });
});