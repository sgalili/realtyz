import type { PublicListingDraftFields } from './publicListingDraft';

/** Pricing completion is independent of the separate legal consent controls. */
export function pricingCardComplete(fields: PublicListingDraftFields): boolean {
  return Number(fields.price) > 0 && Number(fields.commissionDeal) > 0 &&
    [fields.commissionForm, fields.commissionWhatsapp, fields.commissionPhone].every(value =>
      value == null || value.trim() === '' || (Number.isFinite(Number(value)) && Number(value) >= 0));
}
