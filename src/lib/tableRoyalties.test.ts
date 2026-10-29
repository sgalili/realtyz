import { describe, expect, it } from 'vitest';
import { rewardZeroTypes, tableRoyalties } from './tableRoyalties';
const types = { form: true, whatsapp: false, phone: true, closing: false };
const amounts = { tier1: 100, tier2: 0, tier3: 200, tier4: 10000 };
describe('table royalty visibility', () => {
  it('never converts missing or redacted amounts into zero', () => {
    expect(tableRoyalties({}, {}, true, false).prices).toEqual({ form: undefined, whatsapp: undefined, phone: undefined, closing: undefined });
  });
  it('guests always see the closing trophy without any prices', () => {
    expect(tableRoyalties(types, { ...amounts, tier4: 0 }, false, false)).toEqual({ types: { form: true, whatsapp: true, phone: true, closing: true }, prices: undefined });
  });
  it('signed-in non-brokers see net lead prices but no closing price', () => {
    const result = tableRoyalties(types, amounts, true, false);
    expect(result.types.closing).toBe(true);
    expect(result.types).toEqual({ form: true, whatsapp: true, phone: true, closing: true });
    expect(result.prices).toEqual({ form: 80, whatsapp: 0, phone: 160, closing: undefined });
  });
  it('authorized brokers also see net closing commission', () => {
    const r = tableRoyalties(types, amounts, true, true);
    expect(r.types.closing).toBe(true);
    expect(r.prices?.closing).toBe(8000);
  });
  it('no closing price without an authorized amount', () => {
    expect(tableRoyalties(types, { ...amounts, tier4: 0 }, true, true).prices?.closing).toBeUndefined();
  });
  it('shows all four types for a Super Admin without granting closing amounts', () => {
    const result = tableRoyalties(types, amounts, true, false, true);
    expect(result.types).toEqual({ form: true, whatsapp: true, phone: true, closing: true });
    expect(result.prices?.closing).toBeUndefined();
  });
});
describe('rewardZeroTypes', () => {
  it('grays only the lead types without a value and keeps the priced one active', () => {
    expect(rewardZeroTypes({ form: false, whatsapp: false, phone: false, closing: true }))
      .toEqual({ form: true, whatsapp: true, phone: true, closing: false });
  });
  it('treats an unassigned lead type as no value', () => {
    expect(rewardZeroTypes({})).toEqual({ form: true, whatsapp: true, phone: true, closing: true });
  });
  it('keeps every priced lead type active', () => {
    expect(rewardZeroTypes({ form: true, whatsapp: true, phone: true, closing: true }))
      .toEqual({ form: false, whatsapp: false, phone: false, closing: false });
  });
});
