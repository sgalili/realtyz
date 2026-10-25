import { describe, expect, it } from 'vitest';
import { EMPTY_PUBLIC_LISTING_DRAFT } from './publicListingDraft';
import { pricingCardComplete } from './pricingCardSummary';

describe('Card 8 pricing completion', () => {
  it('completes with prices before legal consent', () => {
    expect(pricingCardComplete({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '7000', commissionForm: '40', commissionWhatsapp: '50', commissionPhone: '80', commissionDeal: '3006', commissionDealType: 'fixed', commissionTermsAccepted: false })).toBe(true);
  });
  it('accepts disabled optional lead fees', () => {
    expect(pricingCardComplete({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '7000', commissionForm: '0', commissionDeal: '10' })).toBe(true);
  });
  it('requires positive property and closing prices', () => {
    expect(pricingCardComplete({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '7000', commissionDeal: '0' })).toBe(false);
    expect(pricingCardComplete({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '0', commissionDeal: '10' })).toBe(false);
  });
});
