import { describe, expect, it } from 'vitest';
import { publisherClosingDefault, showPublisherRewards } from './publisherPricing';

describe('publisher pricing', () => {
  it('hides rewards for empty prices and prices with four or fewer digits', () => {
    for (const price of ['', '0', '123', '9999', '9,999']) expect(showPublisherRewards(price)).toBe(false);
  });
  it('shows rewards starting at five digits for both property and rental prices', () => {
    expect(showPublisherRewards('10000')).toBe(true);
    expect(showPublisherRewards('10,000')).toBe(true);
  });
  it('defaults a new sale closing fee to 1 percent', () => {
    expect(publisherClosingDefault('sale')).toBe(1);
  });
  it('retains the rental minimum of 10 percent', () => {
    expect(publisherClosingDefault('rent')).toBe(10);
  });
});