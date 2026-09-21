/**
 * ritaPremsg
 * ----------
 * SINGLE SOURCE OF TRUTH for the WhatsApp click-to-chat pre-filled message
 * used on every property landing page and public listing.
 *
 * Canonical format:
 *   היי ריטה, אשמח לקבל פרטים אודות ה{סוג הנכס} ברחוב {רחוב ומספר בית} ב{עיר}.
 *
 * Every variable is populated from the property row itself (the /properties
 * database), never invented. When a part is genuinely missing it is dropped
 * instead of guessed, so Rita always receives a parsable, truthful opener.
 */
import { streetLine, type AddressParts } from './fullAddress';
import { PROPERTY_TYPE_LABELS_HE } from './homelyMockProperties';

export type PremsgProperty = AddressParts & {
  property_type?: string | null;
  features?: unknown;
  attributes?: unknown;
  property_title?: string | null;
  title?: string | null;
  description?: string | null;
};

const TYPE_ALIASES: Record<string, string> = {
  apartment: 'דירה',
  flat: 'דירה',
  garden_apartment: 'דירת גן',
  house: 'בית',
  private_house: 'בית',
  cottage: 'קוטג׳',
  villa: 'וילה',
  penthouse: 'פנטהאוז',
  duplex: 'דופלקס',
  studio: 'סטודיו',
  commercial: 'נכס מסחרי',
  office: 'משרד',
  land: 'מגרש',
  lot: 'מגרש',
};

/** Hebrew type words we trust when the row has no explicit type field. */
const HE_TYPES = ['דירת גן', 'פנטהאוז', 'מיני פנטהאוז', 'דופלקס', 'קוטג׳', 'קוטג', 'וילה', 'בית פרטי', 'סטודיו', 'מגרש', 'משרד', 'דירה'];

function pick(source: unknown, key: string): string | null {
  if (!source) return null;
  const row = Array.isArray(source) ? source[0] : source;
  if (!row || typeof row !== 'object') return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Readable Hebrew label for the property kind ("דירה", "בית"…), or "נכס". */
export function propertyKindLabel(row: PremsgProperty): string {
  const raw =
    (typeof row.property_type === 'string' ? row.property_type : null) ||
    pick(row.features, 'property_type') ||
    pick(row.attributes, 'property_type') ||
    pick(row.attributes, 'subcategory');
  if (raw) {
    const key = raw.trim().toLowerCase();
    const mapped = (PROPERTY_TYPE_LABELS_HE as Record<string, string>)[key] ?? TYPE_ALIASES[key];
    if (mapped) return mapped;
    if (/[\u0590-\u05FF]/.test(raw)) return raw.trim();
  }
  const text = `${row.property_title ?? ''} ${row.title ?? ''} ${row.description ?? ''}`;
  const found = HE_TYPES.find((word) => text.includes(word));
  if (found) return found === 'קוטג' ? 'קוטג׳' : found;
  return 'נכס';
}

/** Street name + house number only (apartment numbers never leave here). */
export function premsgStreet(row: PremsgProperty): string {
  return streetLine({ ...row, apartment_number: null }).split(',')[0].trim();
}

/** The canonical WhatsApp pre-filled message for one property. */
export function ritaPropertyPremsg(row: PremsgProperty | null | undefined): string {
  const property = row ?? {};
  const kind = propertyKindLabel(property);
  const street = premsgStreet(property);
  const city = String(property.city ?? '').trim();

  if (!street && !city) {
    const fallback = String(property.property_title ?? property.title ?? '').trim();
    return fallback
      ? `היי ריטה, אשמח לקבל פרטים אודות ${fallback}.`
      : 'היי ריטה, אשמח לקבל פרטים אודות הנכס הזה.';
  }

  const parts = [`היי ריטה, אשמח לקבל פרטים אודות ה${kind}`];
  if (street) parts.push(`ברחוב ${street}`);
  if (city) parts.push(`ב${city}`);
  return `${parts.join(' ')}.`;
}
