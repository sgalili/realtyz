/**
 * parseSearchQuery
 * ----------------
 * Lightweight Hebrew/English NLP for the properties search bar. Extracts
 * structured hints (city, neighborhood, rooms, property type, deal type,
 * price bounds) from a free-text query like:
 *   "דירה 4 חדרים בשכונת שביב בהרצליה עד 3 מיליון"
 *
 * All fields are optional; whatever we can't confidently detect is left
 * `null` so downstream sources can decide how to handle it.
 */
import { CURATED_SERVICE_AREAS } from '@/lib/serviceAreas';

export type ParsedQuery = {
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  property_type: string | null;
  listing_type: 'sale' | 'rent' | null;
  min_price: number | null;
  max_price: number | null;
  amenities: string[];
  keywords: string;
};

const PROPERTY_TYPE_MAP: Array<[RegExp, string]> = [
  [/\bדירת?\s*גן\b/, 'garden_apartment'],
  [/\bפנטהאוז\b|\bפנטהאוס\b/, 'penthouse'],
  [/\bדופלקס\b/, 'duplex'],
  [/\bוילה\b|\bקוטג'?\b/, 'house'],
  [/\bבית\s*פרטי\b/, 'house'],
  [/\bסטודיו\b/, 'studio'],
  [/\bדירה\b|\bapartment\b/i, 'apartment'],
  [/\bמגרש\b|\bקרקע\b/, 'land'],
  [/\bמסחרי\b|\bעסק\b|\bחנות\b|\bמשרד\b/, 'commercial'],
];

/**
 * Amenity vocabulary. `query` matches what the user typed; `match` is the
 * wider pattern used to test a listing's own text/features when filtering.
 */
export const AMENITY_RULES: Array<{ key: string; label: string; query: RegExp; match: RegExp }> = [
  { key: 'balcony', label: 'מרפסת', query: /מרפסת|מרפסות|balcon/i, match: /מרפסת|מרפסות|balcon|terrace/i },
  { key: 'parking', label: 'חניה', query: /חני[יה]ה?|חניות|parking/i, match: /חני[יה]|חניות|parking|garage/i },
  { key: 'elevator', label: 'מעלית', query: /מעלית|elevator|lift/i, match: /מעלית|elevator|lift/i },
  { key: 'safe_room', label: 'ממ״ד', query: /ממ["״']?ד|מרחב\s*מוגן|safe\s*room/i, match: /ממ["״']?ד|מרחב\s*מוגן|safe\s*room|shelter/i },
  { key: 'storage', label: 'מחסן', query: /מחסן|storage/i, match: /מחסן|storage/i },
  { key: 'renovated', label: 'משופצת', query: /משופצ|שופצ|renovated/i, match: /משופצ|שופצ|renovated/i },
  { key: 'furnished', label: 'מרוהטת', query: /מרוהט|ריהוט|furnished/i, match: /מרוהט|ריהוט|furnished/i },
  { key: 'garden', label: 'גינה', query: /גינה|חצר|garden|yard/i, match: /גינה|חצר|garden|yard/i },
  { key: 'pool', label: 'בריכה', query: /בריכה|pool/i, match: /בריכה|pool/i },
  { key: 'ac', label: 'מיזוג', query: /מיזוג|מזגן|air\s*condition/i, match: /מיזוג|מזגן|air\s*condition|a\/c/i },
  { key: 'accessible', label: 'נגישות', query: /נגיש|accessib/i, match: /נגיש|accessib/i },
  { key: 'pets', label: 'חיות מחמד', query: /חיות\s*מחמד|pets?/i, match: /חיות\s*מחמד|pets?/i },
  { key: 'sea_view', label: 'נוף לים', query: /נוף\s*לים|sea\s*view/i, match: /נוף\s*לים|sea\s*view/i },
];

function detectAmenities(text: string): string[] {
  return AMENITY_RULES.filter((r) => r.query.test(text)).map((r) => r.key);
}

/**
 * True when every requested amenity appears in the listing's own text blob.
 * Used as a soft post-filter over unified search results.
 */
export function matchesAmenities(text: string, amenities: string[]): boolean {
  if (!amenities.length) return true;
  const blob = String(text ?? '');
  return amenities.every((key) => {
    const rule = AMENITY_RULES.find((r) => r.key === key);
    return rule ? rule.match.test(blob) : true;
  });
}

export function amenityLabel(key: string): string {
  return AMENITY_RULES.find((r) => r.key === key)?.label ?? key;
}


function normalizeCity(raw: string): string {
  return raw.replace(/[״"׳']/g, '').replace(/\s+/g, ' ').trim();
}

function detectCityNeighborhood(text: string): { city: string | null; neighborhood: string | null } {
  const t = normalizeCity(text);
  let matchedCity: string | null = null;
  let matchedHood: string | null = null;
  for (const { city, neighborhoods } of CURATED_SERVICE_AREAS) {
    const cityRe = new RegExp(`(?:^|[^\\p{L}])${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'u');
    if (cityRe.test(t)) matchedCity = city;
    for (const n of neighborhoods) {
      const hoodRe = new RegExp(`(?:^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'u');
      if (hoodRe.test(t)) {
        matchedHood = n;
        if (!matchedCity) matchedCity = city;
      }
    }
  }
  // Explicit "בשכונת X" / "שכונת X" pattern — capture user-typed hood names
  // even when they're not in the curated list.
  if (!matchedHood) {
    const m = t.match(/שכונת?\s+([\p{L}"'׳״\-\s]{2,25}?)(?=\s+ב|\s+ל|\s+עד|\s+מעל|$)/u);
    if (m) matchedHood = m[1].trim();
  }
  return { city: matchedCity, neighborhood: matchedHood };
}

function detectRooms(text: string): number | null {
  // "4 חדרים", "4 חד'", "4 ח'", "4 rooms", "חדר וחצי"
  const m = text.match(/(\d+(?:[.,]\d)?)\s*(?:חדרים|חדר|חד['׳]?|ח['׳])\b?/);
  if (m) return Number(m[1].replace(',', '.'));
  const m2 = text.match(/(\d+(?:[.,]\d)?)\s*rooms?/i);
  if (m2) return Number(m2[1].replace(',', '.'));
  if (/חדר\s*וחצי/.test(text)) return 1.5;
  return null;
}

function detectPropertyType(text: string): string | null {
  for (const [re, type] of PROPERTY_TYPE_MAP) if (re.test(text)) return type;
  return null;
}

function detectListingType(text: string): 'sale' | 'rent' | null {
  if (/שכירות|להשכרה|להשכיר|השכרה|שכר\s*דירה|שכר\s*חודשי|for\s*rent|rental|to\s*let/i.test(text)) return 'rent';
  if (/למכירה|מכירה|לקנות|קנייה|רכישה|for\s*sale|buy/i.test(text)) return 'sale';
  return null;
}

function priceScale(text: string, base: number): number {
  if (/מיליון|million/i.test(text)) return base * 1_000_000;
  if (/אלף|k\b|thousand/i.test(text)) return base * 1_000;
  return base;
}

function detectPrice(text: string): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;
  const maxM = text.match(/(?:עד|max|maximum|below|under)\s*(\d+(?:[.,]\d+)?)\s*(?:מיליון|million|אלף|k|thousand)?/i);
  if (maxM) max = priceScale(maxM[0], Number(maxM[1].replace(',', '.')));
  const minM = text.match(/(?:מעל|החל\s*מ|from|above|over)\s*(\d+(?:[.,]\d+)?)\s*(?:מיליון|million|אלף|k|thousand)?/i);
  if (minM) min = priceScale(minM[0], Number(minM[1].replace(',', '.')));
  const rangeM = text.match(/(\d+(?:[.,]\d+)?)\s*(?:מיליון|million|אלף|k)?\s*-\s*(\d+(?:[.,]\d+)?)\s*(?:מיליון|million|אלף|k)?/i);
  if (rangeM) {
    min = min ?? priceScale(rangeM[0], Number(rangeM[1].replace(',', '.')));
    max = max ?? priceScale(rangeM[0], Number(rangeM[2].replace(',', '.')));
  }
  return { min, max };
}

export function parseSearchQuery(input: string): ParsedQuery {
  const text = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return { city: null, neighborhood: null, rooms: null, property_type: null, listing_type: null, min_price: null, max_price: null, amenities: [], keywords: '' };
  }
  const { city, neighborhood } = detectCityNeighborhood(text);
  const rooms = detectRooms(text);
  const property_type = detectPropertyType(text);
  const listing_type = detectListingType(text);
  const { min, max } = detectPrice(text);
  const amenities = detectAmenities(text);

  // Keywords = everything the user typed with the detected structured tokens
  // stripped, so external free-text search still gets meaningful residue.
  let keywords = text;
  for (const tok of [city, neighborhood]) {
    if (tok) keywords = keywords.replace(new RegExp(tok, 'gu'), ' ');
  }
  keywords = keywords
    .replace(/שכונת?/g, ' ')
    .replace(/(\d+(?:[.,]\d)?)\s*(?:חדרים|חדר|חד['׳]?|ח['׳])/g, ' ')
    .replace(/שכירות|להשכרה|להשכיר|השכרה|למכירה|מכירה|לקנות|רכישה/g, ' ')
    .replace(/(?:עד|מעל|from|above|over|under|below|max|min)\s*\d+(?:[.,]\d+)?\s*(?:מיליון|million|אלף|k|thousand)?/gi, ' ')
    .replace(/\bעם\b|\bכולל\b|\bו-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { city, neighborhood, rooms, property_type, listing_type, min_price: min, max_price: max, amenities, keywords };
}

