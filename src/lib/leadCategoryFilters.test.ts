import { describe, expect, it } from 'vitest';
import { leadCategoryOrFilter, visibleLeadKinds, type LeadKind } from './leadCategoryFilters';

const available: LeadKind[] = ['buyer', 'seller', 'renter', 'landlord'];

describe('lead category filtering', () => {
  it('combines selected categories with OR', () => {
    expect(leadCategoryOrFilter(['buyer', 'seller'], available))
      .toBe('preferences->>lead_kind.eq.buyer,preferences->>lead_kind.eq.seller');
  });
  it('leaves zero/all-visible selections unrestricted, including unclassified leads', () => {
    expect(leadCategoryOrFilter([], available)).toBeUndefined();
    expect(leadCategoryOrFilter(available, available)).toBeUndefined();
  });
  it('deduplicates and ignores stale unavailable selections', () => {
    expect(leadCategoryOrFilter(['buyer', 'buyer', 'broker'], available))
      .toBe('preferences->>lead_kind.eq.buyer');
    expect(leadCategoryOrFilter(['broker'], available)).toBeUndefined();
  });
  it('hides brokers even when broker accounts are also partners', () => {
    expect(visibleLeadKinds({ ownerOnly: false, developer: false, broker: true, affiliateConsented: true }))
      .toEqual([...available, 'affiliate']);
  });
  it('retains developer/owner relevance and requires affiliate consent', () => {
    expect(visibleLeadKinds({ ownerOnly: false, developer: true, broker: false, affiliateConsented: false }))
      .toEqual(['buyer', 'broker']);
    expect(visibleLeadKinds({ ownerOnly: true, developer: false, broker: false, affiliateConsented: false }))
      .toEqual(['buyer', 'renter']);
  });
});