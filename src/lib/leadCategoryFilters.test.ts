import { describe, expect, it } from 'vitest';
import { leadCategoryOrFilter, resolveLeadKind, visibleLeadKinds, type LeadKind } from './leadCategoryFilters';

const available: LeadKind[] = ['buyer', 'seller', 'renter', 'landlord'];

describe('lead category filtering', () => {
  it('combines selected categories with OR on the resolved category', () => {
    expect(leadCategoryOrFilter(['buyer', 'seller'], available)).toBe('lead_category.in.(buyer,seller)');
  });
  it('single selection restricts to that category; zero selection is unrestricted', () => {
    expect(leadCategoryOrFilter(['landlord'], available)).toBe('lead_category.in.(landlord)');
    expect(leadCategoryOrFilter([], available)).toBeUndefined();
  });
  it('deduplicates and ignores stale unavailable selections', () => {
    expect(leadCategoryOrFilter(['buyer', 'buyer', 'broker'], available)).toBe('lead_category.in.(buyer)');
    expect(leadCategoryOrFilter(['broker'], available)).toBeUndefined();
  });
  it('resolves kind from the server column before preferences', () => {
    expect(resolveLeadKind({ lead_category: 'renter', preferences: { lead_kind: 'buyer' } })).toBe('renter');
    expect(resolveLeadKind({ preferences: { lead_kind: 'seller' } })).toBe('seller');
    expect(resolveLeadKind({ lead_category: 'bogus' })).toBeNull();
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