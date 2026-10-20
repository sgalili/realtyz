import { describe, expect, it } from 'vitest';
import { activeLeadLimits, clampClosingPercent, closingFeeAmount, closingFeeRange } from './closingFee';

describe('closing fee rules', () => {
  it('limits sale to 0.2%–2% of property price', () => {
    expect(closingFeeRange('sale', 2000000)).toMatchObject({ min: 0.2, max: 2 });
    expect(clampClosingPercent(0, 'sale')).toBe(0.2);
    expect(clampClosingPercent(3, 'sale')).toBe(2);
    expect(closingFeeAmount(0.2, 2000000)).toBe(4000);
  });
  it('limits rent to 10%–100% and 600–6000 ILS at rent 6000', () => {
    const range = closingFeeRange('rent', 6000);
    expect(range).toMatchObject({ min: 10, max: 100 });
    expect(closingFeeAmount(range.min, 6000)).toBe(600);
    expect(closingFeeAmount(range.max, 6000)).toBe(6000);
    expect(clampClosingPercent(101, 'rent')).toBe(100);
  });
  it('retains only positive individual caps for priced lead types', () => {
    expect(activeLeadLimits([100, 0, 150], { form: 3, whatsapp: 4, phone: 5 })).toEqual({ form: 3, whatsapp: null, phone: 5 });
    expect(activeLeadLimits([100, 150, 200], { form: 0, whatsapp: -1, phone: 1.5 })).toEqual({ form: null, whatsapp: null, phone: null });
  });
});