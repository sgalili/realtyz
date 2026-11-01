import { describe, it, expect } from 'vitest';
import { importCommissionPayload, runPool } from './importCommissionDefaults';

describe('import commission defaults', () => {
  it('sale ads default to 1% closing', () => {
    const p = importCommissionPayload('sale', 2_000_000);
    expect(p.affiliate_tier4_type).toBe('percent');
    expect(p.affiliate_tier4_amount).toBe(1);
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
  it('runs tasks in parallel up to the limit', async () => {
    let active = 0, peak = 0;
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; });
    expect(peak).toBe(3);
  });
});
