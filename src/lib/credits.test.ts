import { describe, expect, it } from 'vitest';
import { agorotToCredits, fmtCompactCredits, fmtCredits, ilsToCredits } from './credits';
import { isSyntheticEmail } from './friendlyUserDisplayName';

describe('credits-first displays', () => {
  it('compacts header balances without losing small fractional credits', () => {
    expect(fmtCompactCredits(1300)).toBe('1.3k קרדיטים');
    expect(fmtCompactCredits(5000)).toBe('5k קרדיטים');
    expect(fmtCompactCredits(0.25)).toBe('0.25 קרדיטים');
    expect(fmtCompactCredits(0)).toBe('0 קרדיטים');
    expect(fmtCompactCredits(1234, 2)).toBe('1.23k קרדיטים');
    expect(fmtCompactCredits(125000, 2)).toBe('125k קרדיטים');
  });
  it('converts rewards and fractional action charges without changing stored ILS', () => {
    expect(ilsToCredits(200)).toBe(5000);
    expect(ilsToCredits(100)).toBe(2500);
    expect(agorotToCredits(2)).toBe(0.5);
    expect(fmtCredits(0.25)).toBe('0.25 קרדיטים');
    expect(fmtCredits(5000)).toBe('5,000 קרדיטים');
  });
  it('hides placeholder emails but preserves explicitly supplied addresses', () => {
    expect(isSyntheticEmail('972500000000@whatsapp.realtyz.local')).toBe(true);
    expect(isSyntheticEmail('member@account.invalid')).toBe(true);
    expect(isSyntheticEmail('member@gmail.com')).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
  });
});
import { agorotToCredits as a2c, creditsToIls as c2i, ilsToCredits as i2c, setCreditsPerIls as setRate } from './credits';
import { campaignServicePrice } from './campaignServicePricing';
describe('central credit conversion rate', () => {
  it('follows the configured rate both ways', () => {
    setRate(50);
    expect(i2c(2)).toBe(100);
    expect(c2i(100)).toBe(2);
    expect(a2c(4)).toBe(2);
    setRate(25);
    expect(c2i(100)).toBe(4);
  });
  it('prices social posts the same on every campaign card', () => {
    expect(campaignServicePrice('facebook', [{ action_key: 'social_post', label_he: '', unit_he: 'פוסט', price_agorot: 40 }])?.credits).toBe(2);
  });
});
