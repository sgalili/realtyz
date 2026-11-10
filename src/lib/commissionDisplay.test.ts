import { describe, expect, it } from 'vitest';
import { commissionAmountFromPercent, commissionBarePercent, commissionOfferFromPrice, commissionOfferLabel, commissionPercentLabel } from './commissionDisplay';

describe('commission display: shekels first, percentage in parentheses', () => {
  it('labels a rent closing fee as shekels then the percentage', () => {
    expect(commissionOfferLabel(2667, 50)).toBe('₪2,667 (50%)');
  });
  it('labels a sale closing fee as shekels then the percentage', () => {
    expect(commissionOfferLabel(20000, 1)).toBe('₪20,000 (1%)');
  });
  it('keeps sale percentage bounds readable to two decimals', () => {
    expect(commissionPercentLabel(0.2)).toBe('(0.2%)');
    expect(commissionPercentLabel(0.005)).toBe('(0.01%)');
  });
  it('converts a percentage of a base price into whole shekels', () => {
    expect(commissionAmountFromPercent(5333, 50)).toBe(2667);
    expect(commissionAmountFromPercent(2000000, 0.5)).toBe(10000);
  });
  it('shows shekels first when a base price is known', () => {
    expect(commissionOfferFromPrice(2000000, 0.5)).toBe('₪10,000 (0.5%)');
    expect(commissionOfferFromPrice(6000, 20)).toBe('₪1,200 (20%)');
  });
  it('falls back to the bare percentage only when no base price exists', () => {
    expect(commissionOfferFromPrice(0, 0.5)).toBe('0.5%');
    expect(commissionOfferFromPrice(null as unknown as number, 20)).toBe('20%');
    expect(commissionBarePercent(100)).toBe('100%');
  });
});
