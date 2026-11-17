/** Publication readiness for rows in "הנכסים שלי". Pure, so it is unit-tested. */
export type ListingReadinessInput = {
  price?: number | null;
  size_sqm?: number | null;
  photos?: string[] | null;
  raw?: Record<string, any> | null;
};

export type ListingPublicationState = 'published' | 'draft' | 'pending';

export function missingListingDetails(r: ListingReadinessInput): string[] {
  const missing: string[] = [];
  if (!(typeof r.price === 'number' && r.price > 0)) missing.push('מחיר');
  if (!(typeof r.size_sqm === 'number' && r.size_sqm > 0)) missing.push('מ"ר');
  if (!r.photos || r.photos.length === 0) missing.push('תמונות');
  const closing = r.raw?.features?.deal_closing_commission;
  const value = Number(closing?.value);
  if (!closing || !Number.isFinite(value) || value <= 0) missing.push('עמלות');
  return missing;
}

export function listingPublicationState(r: ListingReadinessInput): ListingPublicationState {
  const raw = r.raw ?? {};
  if (raw.is_published === true && raw.status !== 'draft') return 'published';
  if (raw.status === 'draft') return 'draft';
  return 'pending';
}

export const PUBLICATION_STATE_LABELS: Record<ListingPublicationState, string> = {
  published: 'מפורסם',
  draft: 'טיוטה',
  pending: 'לא פורסם',
};
