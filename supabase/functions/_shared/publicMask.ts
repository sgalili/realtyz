// ============================================================
// publicMask
// ------------------------------------------------------------
// Lead-wall masking for the anonymous public listings board.
//
// Anonymous visitors must be able to judge a property (city, neighborhood,
// rooms, size, price, photos) without ever receiving the data that lets them
// bypass the platform: the exact street number, the apartment number, and any
// phone / email / full name of the owner or broker.
// ============================================================

const UNIT = /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|מ['׳]|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;

/**
 * Full street line including house and apartment numbers.
 * Public property views show the complete address.
 */
export function fullAddress(row: Record<string, any>): string {
  let line = String(row?.address ?? "").replace(/\s+/g, " ").trim();
  const house = row?.house_number == null ? "" : String(row.house_number).trim();
  const apt = row?.apartment_number == null ? "" : String(row.apartment_number).trim();
  if (house && !new RegExp(`(^|[\\s,])${house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s,]|$)`).test(line)) {
    line = line ? `${line} ${house}` : house;
  }
  if (apt && !/(דירה|דירת|יח["׳']|apt|unit)\s*\d/i.test(line)) {
    line = line ? `${line}, דירה ${apt}` : `דירה ${apt}`;
  }
  return line;
}

/** Street name without any building / entrance / apartment number. */
export function maskAddress(value: unknown): string {
  let s = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/(?:דירה|דירת|ד['׳"]|כניסה|בית|מספר)\s*\d+[א-ת]?\b/g, "");
  const wordDigit = /(^|[^\d:=״"׳'])([\u0590-\u05FF]{2,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?(?=\s|,|$)/;
  for (let i = 0; i < 6; i++) {
    const next = s.replace(wordDigit, (m, pre, word, _num, offset, full) => {
      const after = String(full).slice(offset + m.length, offset + m.length + 24);
      if (UNIT.test(after.trim())) return m;
      if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט|בן|בת)$/.test(word)) return m;
      return `${pre}${word}`;
    });
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+,/g, ",").replace(/[ \t]{2,}/g, " ").replace(/[,\s]+$/g, "").trim();
}

/** Removes phone numbers and email addresses from any free text. */
export function maskContactText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
    .replace(/(?:\+?972|0)\s*\d(?:[\s-]?\d){7,9}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type PublicCard = {
  id: string;
  slug: string | null;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string;
  house_number: string | null;
  apartment_number: string | null;
  deal_type: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  total_floors: number | null;
  price: number | null;
  description: string | null;
  photos: string[];
  masked: true;
};

function photosOf(row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const media = row.media_photos;
  if (Array.isArray(media)) {
    for (const item of media) {
      const url = typeof item === "string" ? item : (item as any)?.url ?? (item as any)?.src;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) out.push(url);
    }
  }
  const main = row.image_url;
  if (typeof main === "string" && /^https?:\/\//i.test(main) && !out.includes(main)) out.unshift(main);
  return out.slice(0, 12);
}

/** Builds the ONLY shape an anonymous visitor may ever receive. */
export function toPublicCard(row: Record<string, any>): PublicCard {
  const rawDescription = row.short_description || row.description || row.long_description || "";
  const rawTotalFloors = row.features && typeof row.features === "object"
    ? row.features.total_floors
    : null;
  return {
    id: String(row.id),
    slug: row.slug ?? null,
    title: row.property_title ? String(row.property_title).trim() : null,
    city: row.city ?? null,
    neighborhood: row.neighborhood ?? null,
    street: fullAddress(row),
    house_number: row.house_number == null ? null : String(row.house_number),
    apartment_number: row.apartment_number == null ? null : String(row.apartment_number),
    deal_type: row.deal_type ?? null,
    rooms: row.rooms == null ? null : Number(row.rooms),
    sqm: row.sqm == null ? null : Number(row.sqm),
    floor: row.floor == null ? null : Number(row.floor),
    total_floors: rawTotalFloors == null || rawTotalFloors === "" ? null : Number(rawTotalFloors),
    price: row.asking_price == null ? null : Number(row.asking_price),
    description: maskContactText(rawDescription).slice(0, 700) || null,
    photos: photosOf(row),
    masked: true,
  };
}

export const PUBLIC_CARD_COLUMNS =
  "id, slug, property_title, address, house_number, apartment_number, city, neighborhood, deal_type, rooms, sqm, floor, features, asking_price, description, short_description, long_description, image_url, media_photos, created_at, is_published, status, affiliate_enabled";
