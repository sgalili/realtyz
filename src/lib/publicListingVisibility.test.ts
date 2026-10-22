import { describe, expect, it } from 'vitest';
import { isFeedEligible, publicPricing } from '../../supabase/functions/_shared/publicListingVisibility';

describe('unified feed visibility', () => {
  it('includes published site-only properties', () => {
    expect(isFeedEligible({ is_published: true, affiliate_enabled: false, status: 'live' })).toBe(true);
  });
  it('includes properties explicitly open to the network', () => {
    expect(isFeedEligible({ is_published: false, affiliate_enabled: true, status: 'live' })).toBe(true);
  });
  it('excludes private drafts and discarded properties', () => {
    expect(isFeedEligible({ is_published: false, affiliate_enabled: false, status: 'pending' })).toBe(false);
    expect(isFeedEligible({ is_published: true, affiliate_enabled: true, status: 'discarded' })).toBe(false);
  });
  const pricing = { affiliate_tier1_amount: 10, affiliate_tier2_amount: 20, affiliate_tier3_amount: 30, affiliate_tier4_amount: 1000, affiliate_tier4_type: 'fixed' };
  it('hides all prices from guests even when closing allowed is supplied', () => {
    expect(publicPricing(pricing, false, true)).toEqual({});
  });
  it('partners see the first three tiers but never closing', () => {
    expect(publicPricing(pricing, true, false)).toEqual({ affiliate_tier1_amount: 10, affiliate_tier2_amount: 20, affiliate_tier3_amount: 30 });
  });
  it('returns closing pricing only for server-authorized users', () => {
    expect(publicPricing(pricing, true, true)).toEqual(pricing);
  });
});