import { describe, expect, it } from 'vitest';
import { audienceCanSeeListing } from '../../supabase/functions/_shared/publicListingVisibility';
describe('zero lead publication audience', () => {
  it('excludes all three zero-priced leads from guests and unlicensed partners', () => {
    expect(audienceCanSeeListing({ affiliate_tier1_amount: 0, affiliate_tier2_amount: 0, affiliate_tier3_amount: 0, affiliate_tier4_amount: 10000 }, false)).toBe(false);
  });
  it('retains closing-only listings for server-authorized brokers', () => {
    expect(audienceCanSeeListing({ affiliate_tier1_amount: 0, affiliate_tier2_amount: 0, affiliate_tier3_amount: 0 }, true)).toBe(true);
  });
  it('permits general audience when at least one lead is priced', () => {
    expect(audienceCanSeeListing({ affiliate_tier1_amount: 40, affiliate_tier2_amount: 0, affiliate_tier3_amount: 0 }, false)).toBe(true);
  });
});