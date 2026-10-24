import { describe, expect, it } from 'vitest';
import { tableRoyalties } from './tableRoyalties';
const types = { form: true, whatsapp: false, phone: true, closing: true };
const amounts = { tier1: 100, tier2: 0, tier3: 200, tier4: 10000 };
describe('table royalty visibility', () => {
  it('guests see relevant lead types without prices or closing', () => {
    expect(tableRoyalties(types, amounts, false, true)).toEqual({ types: { ...types, closing: false }, prices: undefined });
  });
  it('signed-in non-brokers see net lead prices but no closing', () => {
    const result = tableRoyalties(types, amounts, true, false);
    expect(result.types.closing).toBe(false);
    expect(result.prices).toEqual({ form: 80, whatsapp: 0, phone: 160, closing: undefined });
  });
  it('authorized brokers also see net closing commission', () => {
    const result = tableRoyalties(types, amounts, true, true);
    expect(result.types.closing).toBe(true);
    expect(result.prices?.closing).toBe(8000);
  });
  it('hides closing when no authorized amount is returned', () => {
    expect(tableRoyalties(types, { ...amounts, tier4: 0 }, true, true).types.closing).toBe(false);
  });
});