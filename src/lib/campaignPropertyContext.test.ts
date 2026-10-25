import { describe, expect, it } from 'vitest';
import { canRestorePropertyDraft, propertyCampaignSelection } from './campaignPropertyContext';

describe('selected property campaign context', () => {
  it('does not restore a different property into the clicked property draft', () => {
    expect(canRestorePropertyDraft('selected-property', { selectedListingId: 'previous-property' })).toBe(false);
    expect(canRestorePropertyDraft('selected-property', { selectedListingId: null })).toBe(false);
  });
  it('preserves unfinished work for the same property', () => {
    expect(canRestorePropertyDraft('selected-property', { selectedListingId: 'selected-property' })).toBe(true);
  });
  it('keeps normal draft restoration when no property action was requested', () => {
    expect(canRestorePropertyDraft(null, { selectedListingId: 'previous-property' })).toBe(true);
  });
  it('retains the selected property from single-property and batch links', () => {
    expect(propertyCampaignSelection(new URLSearchParams('listing=selected-property'))).toEqual(['selected-property']);
    expect(propertyCampaignSelection(new URLSearchParams('listing=selected-property&properties=selected-property,other-property,selected-property'))).toEqual(['selected-property', 'other-property']);
  });
});