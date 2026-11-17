import { describe, it, expect } from 'vitest';
import { missingListingDetails, listingPublicationState } from './listingCompleteness';

describe('listing completeness', () => {
  it('lists price, sqm, images and commissions when missing', () => {
    expect(missingListingDetails({ price: null, size_sqm: null, photos: [], raw: {} })).toEqual(['מחיר', 'מ"ר', 'תמונות', 'עמלות']);
  });
  it('complete listing has nothing missing', () => {
    expect(missingListingDetails({ price: 2000000, size_sqm: 90, photos: ['a'], raw: { features: { deal_closing_commission: { value: 0.5 } } } })).toEqual([]);
  });
  it('classifies published, draft and pending', () => {
    expect(listingPublicationState({ raw: { is_published: true, status: 'live' } })).toBe('published');
    expect(listingPublicationState({ raw: { is_published: false, status: 'draft' } })).toBe('draft');
    expect(listingPublicationState({ raw: { is_published: false, status: 'pending' } })).toBe('pending');
  });
});
