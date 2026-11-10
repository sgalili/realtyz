import { describe, expect, it } from 'vitest';
import { averagePricesByDealType } from './importCommissionDefaults';

describe('average base price per deal type for batch commission amounts', () => {
  it('averages asking prices separately for sale and rental ads', () => {
    const prices = averagePricesByDealType([
      { deal_type: 'sale', asking_price: 2000000 },
      { deal_type: 'sale', asking_price: 3000000 },
      { deal_type: 'rent', asking_price: 6000 },
      { deal_type: 'rent', asking_price: 12000 },
    ]);
    expect(prices.sale).toBe(2500000);
    expect(prices.rent).toBe(9000);
  });
  it('ignores ads without a usable price and omits empty deal types', () => {
    expect(averagePricesByDealType([{ deal_type: 'sale', asking_price: 1000000 }, { deal_type: 'rent', asking_price: null }])).toEqual({ sale: 1000000 });
    expect(averagePricesByDealType([])).toEqual({});
  });
  it('treats Hebrew rental deal types as rent', () => {
    expect(averagePricesByDealType([{ deal_type: 'השכרה', asking_price: 5000 }])).toEqual({ rent: 5000 });
  });
});
