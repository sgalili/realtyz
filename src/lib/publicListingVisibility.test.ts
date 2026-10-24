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
  const reward_types = { form: true, whatsapp: true, phone: true, closing: true };
  it('hides all prices from guests even when closing allowed is supplied', () => {
    expect(publicPricing(pricing, false, true)).toEqual({ reward_types });
  });
  it('partners see the first three tiers but never closing', () => {
    expect(publicPricing(pricing, true, false)).toEqual({ affiliate_tier1_amount: 10, affiliate_tier2_amount: 20, affiliate_tier3_amount: 30, reward_types });
  });
  it('returns closing pricing only for server-authorized users', () => {
    expect(publicPricing(pricing, true, true)).toEqual({ ...pricing, reward_types });
  });
  it('exposes only configured positive types to guests, including the trophy without its price', () => {
    expect(publicPricing({ affiliate_tier1_amount: 0, affiliate_tier2_amount: 50, affiliate_tier3_amount: null, affiliate_tier4_amount: 2500 }, false, false)).toEqual({ reward_types: { form: false, whatsapp: true, phone: false, closing: true } });
  });
  it('redacts legacy nested closing pricing from guests and unlicensed users', () => {
    const legacy = { affiliate_tier4_amount: 0, features: { property_type: 'דירה', deal_closing_commission: { type: 'fixed', value: 50000 } } };
    for (const signedIn of [false, true]) {
      const result = publicPricing(legacy, signedIn, false);
      expect(result.features).toEqual({ property_type: 'דירה' });
      expect(result.affiliate_tier4_amount).toBeUndefined();
      expect(result.reward_types).toMatchObject({ closing: true });
    }
    expect(publicPricing(legacy, true, true).affiliate_tier4_amount).toBe(50000);
  });
});