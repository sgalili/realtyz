import { describe, expect, it } from 'vitest';
import { isRentDeal, rentSuffix, formatRentalPrice } from './propertyPrice';

describe('rental price formatting', () => {
  it('appends the monthly suffix only for rentals', () => {
    expect(rentSuffix('rent')).toBe(' / לחודש');
    expect(rentSuffix('sale')).toBe('');
    expect(rentSuffix(null)).toBe('');
    expect(isRentDeal('rent')).toBe(true);
    expect(isRentDeal('sale')).toBe(false);
  });

  it('formats the price with ₪ and keeps the rent suffix', () => {
    expect(formatRentalPrice(5345.08, 'rent')).toBe('₪5,345.08 / לחודש');
    expect(formatRentalPrice(3500, 'rent')).toBe('₪3,500 / לחודש');
  });

  it('leaves sale prices without a suffix', () => {
    expect(formatRentalPrice(2000000, 'sale')).toBe('₪2,000,000');
  });

  it('returns an empty string for missing or invalid prices', () => {
    expect(formatRentalPrice(null, 'rent')).toBe('');
    expect(formatRentalPrice(0, 'rent')).toBe('');
    expect(formatRentalPrice(-5, 'rent')).toBe('');
  });
});
