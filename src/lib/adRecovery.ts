import { EMPTY_PUBLIC_LISTING_DRAFT, type PublicListingDraftFields } from './publicListingDraft';

export function missingAdFields(f: PublicListingDraftFields): string[] {
  return [!f.dealType && 'סוג עסקה', !f.propertyType && 'סוג נכס', !f.city.trim() && 'עיר', !(f.street.trim() || f.address.trim()) && 'כתובת', !(Number(f.price) > 0) && 'מחיר', !f.contactName.trim() && 'שם מפרסם', f.contactWhatsapp.replace(/\D/g, '').length < 9 && 'מספר ווטסאפ', !f.termsAccepted && 'אישור התקנון'].filter((v): v is string => Boolean(v));
}

export function listingToDraft(row: Record<string, any>): PublicListingDraftFields {
  const f = row.features || {};
  const a = row.attributes || {};
  const str = (v: unknown) => v == null ? '' : String(v);
  return { ...EMPTY_PUBLIC_LISTING_DRAFT, listingId: row.id, publisherType: f.publisher_type || '', dealType: row.deal_type || '', propertyType: f.property_type || a.property_type || '', city: row.city || '', address: row.address || '', street: f.street || '', houseNumber: row.house_number || '', neighborhood: row.neighborhood || '', price: row.asking_price > 0 ? str(row.asking_price) : '', rooms: str(row.rooms), sqm: str(row.sqm), floor: str(row.floor), totalFloors: str(f.total_floors || a.total_floors), condition: f.condition || a.condition || '', airDirections: str(f.air_directions || a.air_directions), description: row.long_description || row.description || '', contactName: f.contact_name || '', contactWhatsapp: f.contact_whatsapp || '', elevator: Boolean(row.elevator ?? f.elevator), parking: Boolean(row.parking ?? f.parking), importedListing: { ...row, photos: row.media_photos || (row.image_url ? [row.image_url] : []) }, publicationError: str(row.source_metadata?.publication_error || row.extraction_metadata?.publication_error), resumeStep: 3 };
}