import { describe, it, expect } from 'vitest';
import { allLeadPricesZero } from './leadPricesZero';

describe('allLeadPricesZero', () => {
  it('warns when all three lead prices are 0', () => {
    expect(allLeadPricesZero({ commissionForm: '0', commissionWhatsapp: 0, commissionPhone: '' })).toBe(true);
  });
  it('does not warn when one lead type is priced', () => {
    expect(allLeadPricesZero({ commissionForm: '0', commissionWhatsapp: '50', commissionPhone: '0' })).toBe(false);
  });
});
