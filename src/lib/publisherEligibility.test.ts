import { describe, expect, it } from 'vitest';
import { brokerInventoryChoices, publisherEntryNavigation, publisherRequiresOwnership } from './publisherEligibility';
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

describe('free ad entry', () => {
  it('always resets navigation to publisher selection, independent of cached steps', () => {
    const cached = { step: 8, rolePicked: true, reviewMode: true, importSlide: true, expandedStep: 'step-8' };
    expect({ ...cached, ...publisherEntryNavigation() }).toEqual({ step: 0, rolePicked: false, reviewMode: false, importSlide: false, expandedStep: '' });
  });
  it('requires ownership for the selected private-owner branch', () => {
    expect(publisherRequiresOwnership('private')).toBe(true);
  });
  it('skips ownership for the developer branch', () => {
    expect(publisherRequiresOwnership('developer')).toBe(false);
  });
  it('keeps broker publication and pricing-only edits exempt', () => {
    expect(publisherRequiresOwnership('broker')).toBe(false);
    expect(publisherRequiresOwnership('private', true)).toBe(false);
  });
});