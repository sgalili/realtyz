import { describe, expect, it } from 'vitest';
import { partnerPotential } from './partnerPotential';
describe('potential partners', () => {
  it('scales from 1 at minimum to 100 at maximum', () => {
    expect(partnerPotential(0).count).toBe(1);
    expect(partnerPotential(0.5).count).toBe(51);
    expect(partnerPotential(1).count).toBe(100);
  });
});