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
