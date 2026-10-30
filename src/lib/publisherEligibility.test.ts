import { describe, expect, it } from 'vitest';
import { brokerInventoryChoices } from './publisherEligibility';
describe('broker import choices', () => {
  it('requires verified licensing even for broker roles', () => {
    expect(brokerInventoryChoices(['agent'], false, 1)).toBe(false);
  });
  it('requires at least one ready property', () => {
    expect(brokerInventoryChoices(['agent'], true, 0)).toBe(false);
    expect(brokerInventoryChoices(['agent'], true, 1)).toBe(true);
  });
  it('does not treat partner or Super Admin as a broker', () => {
    expect(brokerInventoryChoices(['affiliate', 'super_admin'], true, 2)).toBe(false);
  });
});