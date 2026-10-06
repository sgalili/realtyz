import { fullPropertyAddress, streetLine } from '@/lib/fullAddress';

const PROPERTY_TYPES: Record<string, string> = {
  apartment: 'דירה', house: 'בית פרטי', cottage: 'קוטג׳', penthouse: 'פנטהאוז',
  duplex: 'דופלקס', studio: 'סטודיו', commercial: 'נכס מסחרי', land: 'מגרש',
  garden_apartment: 'דירת גן', roof_apartment: 'דירת גג', villa: 'וילה',
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function publicPropertyType(row: Record<string, unknown>): string {
  const features = object(row.features);
  const attributes = object(row.attributes);
  const additional = object(row.additional_details);
  const generic = (v: string) => (v === 'כללי' || v.toLowerCase() === 'general' ? '' : v);
  const raw = generic(text(row.property_type) || text(features.property_type) || text(attributes.text) || text(additional.text));
  if (PROPERTY_TYPES[raw.toLowerCase()]) return PROPERTY_TYPES[raw.toLowerCase()];
  if (raw && /[\u0590-\u05FF]/.test(raw)) return raw;
  const title = text(row.property_title) || text(row.title);
  return title.match(/^(דירת גן|דירת גג|בית פרטי|נכס מסחרי|דירה|פנטהאוז|דופלקס|קוטג׳|סטודיו|מגרש|וילה)(?=\s|$)/)?.[1]
    || (Number(additional.roomsCount ?? row.rooms) > 0 ? 'דירה' : 'נכס');
}

export function publicAdTitle(row: Record<string, unknown>): string {
  const type = publicPropertyType(row);
  const deal = row.deal_type === 'rent' ? 'להשכרה' : row.deal_type === 'sale' ? 'למכירה' : '';
  const address = fullPropertyAddress(row);
  if (address) return `${type}${deal ? ` ${deal}` : ''} ${streetLine(row) ? 'ברחוב' : 'ב'}${streetLine(row) ? ' ' : ''}${address}`;
  const original = text(row.property_title) || text(row.title);
  const remainder = original.replace(/למכירה|להשכרה/g, '').replace(new RegExp(`^${type}\\s*`), '').trim();
  return [type, deal, remainder].filter(Boolean).join(' ');
}

export function publicAdDescription(description: string | null | undefined, title?: string | null): string {
  const value = description?.trim() || '';
  return !value || value === title?.trim() || value.length < 40 && /^[^\n]*\s·\s[^\n]*$/.test(value) ? '' : value;
}