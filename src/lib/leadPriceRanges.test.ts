import { describe, expect, it } from 'vitest';
import { clampLeadPrice } from './leadPriceRanges';
describe('lead price ranges', () => {
  it('form fill is 40-150', () => { expect(clampLeadPrice('form', 10)).toBe(40); expect(clampLeadPrice('form', 999)).toBe(150); });
  it('whatsapp filter is 50-200', () => { expect(clampLeadPrice('whatsapp', 0)).toBe(50); expect(clampLeadPrice('whatsapp', 500)).toBe(200); });
  it('phone filter is 80-250', () => { expect(clampLeadPrice('phone', 1)).toBe(80); expect(clampLeadPrice('phone', 300)).toBe(250); });
});
