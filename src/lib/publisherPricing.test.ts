import { describe, expect, it } from 'vitest';
import { publisherClosingDefault, publisherClosingPercent, showPublisherRewards } from './publisherPricing';

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
  it('defaults rent to 50 percent of the monthly price', () => {
    expect(publisherClosingDefault('rent')).toBe(50);
    expect(12000 * publisherClosingDefault('rent') / 100).toBe(6000);
  });
  it('derives the displayed percentage from a fixed closing amount', () => {
    expect(publisherClosingPercent(6000, 'fixed', 12000)).toBe(50);
    expect(publisherClosingPercent(1, 'percent', 2000000)).toBe(1);
  });
});