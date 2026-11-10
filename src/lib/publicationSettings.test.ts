import { describe, expect, it } from 'vitest';
import { brokerOnlyPricing, isTerminalListing, parseDailyLimit, validPublicationFees } from './publicationSettings';

describe('publication safeguards', () => {
  it('restricts zero-priced leads to broker distribution only', () => {
    expect(brokerOnlyPricing([0, '0', 0])).toBe(true);
    expect(brokerOnlyPricing([40, 0, 0])).toBe(false);
  });
  it('never treats sold and removed properties as active', () => {
    expect(isTerminalListing('sold')).toBe(true);
    expect(isTerminalListing('removed')).toBe(true);
    expect(isTerminalListing('live')).toBe(false);
  });
  it('enforces sale closing bounds of 0.2 to 2 percent', () => {
    expect(validPublicationFees('sale', 1000000, [40, 50, 80], 0.2, 'percent')).toBe(true);
    expect(validPublicationFees('sale', 1000000, [40, 50, 80], 2.01, 'percent')).toBe(false);
  });
  it('enforces rent closing bounds of 10 to 100 percent in shekels', () => {
    expect(validPublicationFees('rent', 8000, [0, 0, 0], 800, 'fixed')).toBe(true);
    expect(validPublicationFees('rent', 8000, [0, 0, 0], 799, 'fixed')).toBe(false);
  });
  it('allows empty daily limits and caps individual tiers at 50', () => {
    expect(parseDailyLimit('')).toBeNull();
    expect(parseDailyLimit('50', 50)).toBe(50);
    expect(() => parseDailyLimit('51', 50)).toThrow();
    expect(() => parseDailyLimit('1.5')).toThrow();
  });
});