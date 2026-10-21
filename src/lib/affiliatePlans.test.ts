import { describe, expect, it } from 'vitest';
import { partnerNetReward, realtyzCommission } from './affiliatePlans';

describe('licensed broker closing commission split', () => {
  it('allocates 80% to the broker, including 0.8% from a 1.0% closing fee', () => {
    expect(partnerNetReward(1)).toBe(0.8);
    expect(partnerNetReward(10000)).toBe(8000);
  });
  it('retains 20% as platform fees, including 0.2% from a 1.0% closing fee', () => {
    expect(realtyzCommission(1)).toBe(0.2);
    expect(realtyzCommission(10000)).toBe(2000);
  });
});