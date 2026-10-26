import { describe, expect, it } from 'vitest';
import { isEarnedCredit, SIGNUP_CELEBRATION_MS } from './rewardFeedback';

describe('reward feedback rules', () => {
  it('uses seven seconds for signup celebration', () => expect(SIGNUP_CELEBRATION_MS).toBe(7000));
  it.each(['affiliate_lead_reward', 'closing_commission_payout', 'referral_reward'])('plays for positive confirmed %s', type => {
    expect(isEarnedCredit({ type, amount_ils: 10 })).toBe(true);
  });
  it.each(['launch_bonus', 'manual_adjustment', 'topup', 'usage_deduction', 'dispute_refund'])('does not play for %s', type => {
    expect(isEarnedCredit({ type, amount_ils: 10 })).toBe(false);
  });
  it('does not play for zero, negative or invalid rewards', () => {
    for (const amount_ils of [0, -10, NaN]) expect(isEarnedCredit({ type: 'affiliate_lead_reward', amount_ils })).toBe(false);
  });
});