// Format a property row's display title as:
//   [Street Name] [Street Number] · [Property Type] · [City]
// Rules:
//  - Keep the first numeric group after street words (street number).
//  - Drop any subsequent numeric groups (apartment number, floor tag,
//    building number tail, etc.).
//  - Never drop the street number itself.
//  - Fall back gracefully when parts are missing.
import { PROPERTY_TYPE_LABELS_HE } from '@/lib/homelyMockProperties';

function normalizePropertyTypeLabel(pt: string | null | undefined): string | null {
  if (!pt) return null;
  const key = String(pt).trim().toLowerCase();
  if (!key) return null;
  // Direct key hit in our i18n map.
  const mapped = (PROPERTY_TYPE_LABELS_HE as Record<string, string>)[key];
  if (mapped) return mapped;
  // Common aliases we see from Homely / Yad2.
  const aliases: Record<string, string> = {
    garden_apartment: 'דירת גן',
    'garden apt': 'דירת גן',
    'garden-apt': 'דירת גן',
    flat: 'דירה',
    studio: 'סטודיו',
    cottage: 'קוטג׳',
    villa: 'וילה',
    private_house: 'בית פרטי',
    commercial: 'מסחרי',
    land: 'קרקע',
  };
  return aliases[key] ?? pt;
}

/**
 * Strip apartment/unit tail numbers from an address while keeping the
 * street number. Handles inputs like:
 *   "שדרות חן 19 12" -> "שדרות חן 19"
 *   "רחוב הרצל 5, דירה 8" -> "רחוב הרצל 5"
 *   "Herzl 5 apt 8" -> "Herzl 5"
 */
export function stripApartmentTail(address: string | null | undefined): string {
  const s = String(address ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // Cut anything after an explicit apartment / unit marker.
  const cut = s.split(/(?:,|\s)+(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)\b.*/i)[0].trim();
  // Find the first numeric group; keep it, drop trailing numeric tokens.
  const m = cut.match(/^(.*?\d+[א-תA-Za-z]?)(?:[\s,]+\d+[א-תA-Za-z]?)+\s*$/);
  if (m) return m[1].trim().replace(/[,\s]+$/, '');
  return cut.replace(/[,\s]+$/, '');
}

export function formatListingTitle(input: {
  address?: string | null;
  city?: string | null;
  property_type?: string | null;
  title?: string | null;
}): string {
  const street = stripApartmentTail(input.address);
  const type = normalizePropertyTypeLabel(input.property_type ?? null);
  const city = (input.city ?? '').trim();
  const parts = [street, type, city].map((p) => (p ? String(p).trim() : '')).filter(Boolean);
  if (parts.length === 0) return (input.title ?? '').trim() || 'נכס';
  return parts.join(' · ');
}

/**
 * INTERNAL WORKSPACE ONLY — full-detail title:
 *   `address, house number/appt number, property type`
 *
 * Unlike `formatListingTitle`, this keeps the building AND apartment numbers.
 * NEVER use it for public posts, outbound messages, share pages or landing
 * pages — those must go through `stripAddressNumbers` (Owner Law #1).
 */
export function formatInternalListingTitle(input: {
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  property_type?: string | null;
  title?: string | null;
  apartment?: string | number | null;
  raw?: any;
}): string {
  const r = input.raw ?? {};
  const rawMeta = r.source_metadata && typeof r.source_metadata === 'object' ? r.source_metadata : {};
  const rawAttrs = r.attributes && typeof r.attributes === 'object' ? r.attributes : {};
  const rawFeatures = r.features && typeof r.features === 'object' && !Array.isArray(r.features) ? r.features : {};
  const rawType = input.property_type ??
    rawMeta.property_type ?? rawMeta.propertyType ?? rawMeta.type ??
    rawAttrs.property_type ?? rawAttrs.propertyType ?? rawAttrs.assetType ?? rawAttrs.subcategory ??
    rawFeatures.property_type ??
    null;
  const type = normalizePropertyTypeLabel(rawType == null ? null : String(rawType));
  const city = String(input.city ?? '').trim();
  const hood = String(input.neighborhood ?? '').trim();

  // 1. Clean the address: collapse whitespace, drop trailing city/neighborhood
  //    fragments so we keep only `street + house number [+ apt]`.
  let address = String(input.address ?? '').replace(/\s+/g, ' ').trim();
  address = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== city && p !== hood)
    .join(', ');

  const houseRaw =
    r.house_number ?? r.houseNumber ?? r.street_number ?? r.streetNumber ?? r.number ??
    rawMeta.house_number ?? rawMeta.houseNumber ?? rawMeta.street_number ?? rawMeta.streetNumber ?? rawMeta.number ??
    null;
  const house = houseRaw === null || houseRaw === undefined ? '' : String(houseRaw).trim();
  const addressHasHouseNumber = /\d+[א-תA-Za-z]?\s*$/.test(address);
  if (address && house && !addressHasHouseNumber) {
    address = `${address} ${house}`.trim();
  }

  // 2. Resolve the apartment / unit number from explicit fields when the
  //    address itself doesn't already carry one.
  const rawApt =
    input.apartment ??
    r.apartment_number ?? r.apartmentNumber ?? r.apt_number ?? r.aptNumber ??
    r.apartment ?? r.apt ?? r.unit ?? r.unit_number ??
    rawMeta.apartment_number ?? rawMeta.apartmentNumber ?? rawMeta.apt_number ?? rawMeta.aptNumber ??
    rawMeta.apartment ?? rawMeta.apt ?? rawMeta.unit ?? rawMeta.unit_number ?? null;
  const apt = rawApt === null || rawApt === undefined ? '' : String(rawApt).trim();

  const hasAptInAddress = /(?:דירה|דירת|ד['׳"]|יח["׳']|apt\.?|apartment|unit|#)\s*\d/i.test(address);

  if (apt && !hasAptInAddress) {
    address = `${address} ד' ${apt}`.trim();
  } else if (!apt && !hasAptInAddress) {
    // Address may carry a bare second numeric group ("הפסנתר 8 16") — render
    // that tail as an apartment number for internal clarity.
    const m = address.match(/^(.*?\d+[א-תA-Za-z]?)\s+(\d{1,4}[א-תA-Za-z]?)\s*$/);
    if (m) address = `${m[1]} ד' ${m[2]}`;
  }

  const parts = [address, type].map((p) => (p ? String(p).trim() : '')).filter(Boolean);
  if (!parts.length) return (input.title ?? '').trim() || 'נכס';
  return parts.join(', ');
}

