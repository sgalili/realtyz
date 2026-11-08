import { describe, it, expect } from 'vitest';
import { importCommissionPayload, runPool, DEFAULT_IMPORT_RULE, IMPORT_CLOSING_RANGES, importBatchDealTypes, canApplyImportRule } from './importCommissionDefaults';

describe('import commission defaults', () => {
  it('sale ads default to 0.5% closing', () => {
    const p = importCommissionPayload('sale', 2_000_000);
    expect(p.affiliate_tier4_type).toBe('percent');
    expect(p.affiliate_tier4_amount).toBe(0.5);
  });
  it('rent ads default to 20% of monthly rent as ₪', () => {
    const p = importCommissionPayload('rent', 6500);
    expect(p.affiliate_tier4_type).toBe('fixed');
    expect(p.affiliate_tier4_amount).toBe(1300);
  });
  it('all three lead rewards default to 0 ₪', () => {
    const p = importCommissionPayload('sale', 1);
    expect([p.affiliate_tier1_amount, p.affiliate_tier2_amount, p.affiliate_tier3_amount]).toEqual([0, 0, 0]);
  });
  it('sale range is 0.2 to 2 percent', () => {
    expect(IMPORT_CLOSING_RANGES.sale).toEqual({ min: 0.2, max: 2, step: 0.01 });
    expect(canApplyImportRule({ ...DEFAULT_IMPORT_RULE, salePercent: 0.19 }, ['sale'], true)).toBe(false);
    expect(canApplyImportRule({ ...DEFAULT_IMPORT_RULE, salePercent: 2.01 }, ['sale'], true)).toBe(false);
  });
  it('rent range is 10 to 100 percent', () => {
    expect(IMPORT_CLOSING_RANGES.rent).toEqual({ min: 10, max: 100, step: 1 });
    expect(canApplyImportRule({ ...DEFAULT_IMPORT_RULE, rentMonthlyPercent: 9 }, ['rent'], true)).toBe(false);
    expect(canApplyImportRule({ ...DEFAULT_IMPORT_RULE, rentMonthlyPercent: 101 }, ['rent'], true)).toBe(false);
  });
  it('only offers the actual sale types in a sale-only batch', () => {
    expect(importBatchDealTypes(['sale', 'sale'])).toEqual(['sale']);
  });
  it('only offers rent for a rental-only batch including Hebrew types', () => {
    expect(importBatchDealTypes(['rent', 'השכרה'])).toEqual(['rent']);
  });
  it('offers both types for mixed inventory and none for an empty import', () => {
    expect(importBatchDealTypes(['rent', 'sale', 'rent'])).toEqual(['sale', 'rent']);
    expect(importBatchDealTypes([])).toEqual([]);
  });
  it('blocks applying commissions until explicit legal acceptance', () => {
    expect(canApplyImportRule(DEFAULT_IMPORT_RULE, ['sale', 'rent'], false)).toBe(false);
    expect(canApplyImportRule(DEFAULT_IMPORT_RULE, ['sale', 'rent'], true)).toBe(true);
  });
  it('runs tasks in parallel up to the limit', async () => {
    let active = 0, peak = 0;
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; });
    expect(peak).toBe(3);
  });
});
