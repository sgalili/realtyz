import { describe, expect, it } from 'vitest';
import { campaignCreditBreakdown } from './campaignCreditBreakdown';
describe('campaign charge readback', () => {
  it('charges one credit for each created post', () => { expect(campaignCreditBreakdown({posts_created: 5, groups_published: 0})).toEqual({created:5,published:0,creationCredits:5,publishCredits:0,totalCredits:5}); });
  it('charges one credit for each group publication', () => { expect(campaignCreditBreakdown({posts_created: 0, groups_published: 12})?.totalCredits).toBe(12); });
  it('does not invent counts when no snapshot exists', () => { expect(campaignCreditBreakdown({amount_ils: -4.25})).toBeNull(); });
});