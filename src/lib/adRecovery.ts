import { EMPTY_PUBLIC_LISTING_DRAFT, type PublicListingDraftFields } from './publicListingDraft';

export function missingAdFields(f: PublicListingDraftFields): string[] {
  return [!f.dealType && 'סוג עסקה', !f.propertyType && 'סוג נכס', !f.city.trim() && 'עיר', !(f.street.trim() || f.address.trim()) && 'כתובת', !(Number(f.price) > 0) && 'מחיר', !f.contactName.trim() && 'שם מפרסם', f.contactWhatsapp.replace(/\D/g, '').length < 9 && 'מספר ווטסאפ', !f.termsAccepted && 'אישור התקנון'].filter((v): v is string => Boolean(v));
}

/** Everything that must be complete before the publish button is enabled. */
export function missingPublishFields(f: PublicListingDraftFields, hasMedia: boolean): string[] {
  return [
    !f.publisherType && 'סוג מפרסם',
    !f.dealType && 'סוג עסקה',
    !f.propertyType && 'סוג נכס',
    !f.city.trim() && 'עיר',
    !(f.street.trim() || f.address.trim()) && 'כתובת',
    !(f.floor && f.totalFloors) && 'קומה',
    !f.rooms && 'חדרים',
    !f.condition && 'מצב הנכס',
    !f.airDirections && 'כיווני אוויר',
    !(Number(f.price) > 0) && 'מחיר',
    !(Number(f.sqm) > 0 || Number(f.builtSqm) > 0) && 'שטח',
    !hasMedia && 'תמונה או סרטון',
    !f.contactName.trim() && 'שם מפרסם',
    f.contactWhatsapp.replace(/\D/g, '').length < 9 && 'מספר ווטסאפ',
    !(Number(f.commissionForm) > 0 || Number(f.commissionWhatsapp) > 0 || Number(f.commissionPhone) > 0 || Number(f.commissionDeal) > 0) && 'עמלה לפחות לסוג פנייה אחד',
    !(Number(f.commissionDeal) > 0) && 'עמלת סגירה',
    !f.termsAccepted && 'אישור התקנון',
    !f.commissionTermsAccepted && 'אישור מנגנון העמלות',
  ].filter((v): v is string => Boolean(v));
}

export function listingToDraft(row: Record<string, any>): PublicListingDraftFields {
  const f = row.features || {};
  const a = row.attributes || {};
  const str = (v: unknown) => v == null ? '' : String(v);
  return { ...EMPTY_PUBLIC_LISTING_DRAFT, listingId: row.id, publisherType: f.publisher_type || '', dealType: row.deal_type || '', propertyType: f.property_type || a.property_type || '', city: row.city || '', address: row.address || '', street: f.street || '', houseNumber: row.house_number || '', neighborhood: row.neighborhood || '', price: row.asking_price > 0 ? str(row.asking_price) : '', rooms: str(row.rooms), sqm: str(row.sqm), floor: str(row.floor), totalFloors: str(f.total_floors || a.total_floors), condition: f.condition || a.condition || '', airDirections: str(f.air_directions || a.air_directions), description: row.long_description || row.description || '', contactName: f.contact_name || '', contactWhatsapp: f.contact_whatsapp || '', elevator: Boolean(row.elevator ?? f.elevator), parking: Boolean(row.parking ?? f.parking), importedListing: { ...row, photos: row.media_photos || (row.image_url ? [row.image_url] : []) }, publicationError: str(row.source_metadata?.publication_error || row.extraction_metadata?.publication_error), resumeStep: 3 };
}