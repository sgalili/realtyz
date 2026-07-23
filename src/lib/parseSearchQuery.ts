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
  const m = text.match(/(\d+(?:[.,]\d)?)\s*חדרים?/);
  if (m) return Number(m[1].replace(',', '.'));
  const m2 = text.match(/(\d+(?:[.,]\d)?)\s*rooms?/i);
  if (m2) return Number(m2[1].replace(',', '.'));
  return null;
}

function detectPropertyType(text: string): string | null {
  for (const [re, type] of PROPERTY_TYPE_MAP) if (re.test(text)) return type;
  return null;
}

function detectListingType(text: string): 'sale' | 'rent' | null {
  if (/שכירות|להשכרה|שכר\s*חודשי|for\s*rent|rental/i.test(text)) return 'rent';
  if (/למכירה|מכירה|for\s*sale|sale/i.test(text)) return 'sale';
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
  const minM = text.match(/(?:מעל|from|above|over)\s*(\d+(?:[.,]\d+)?)\s*(?:מיליון|million|אלף|k|thousand)?/i);
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
    return { city: null, neighborhood: null, rooms: null, property_type: null, listing_type: null, min_price: null, max_price: null, keywords: '' };
  }
  const { city, neighborhood } = detectCityNeighborhood(text);
  const rooms = detectRooms(text);
  const property_type = detectPropertyType(text);
  const listing_type = detectListingType(text);
  const { min, max } = detectPrice(text);

  // Keywords = everything the user typed with the detected structured tokens
  // stripped, so external free-text search still gets meaningful residue.
  let keywords = text;
  for (const tok of [city, neighborhood]) {
    if (tok) keywords = keywords.replace(new RegExp(tok, 'gu'), ' ');
  }
  keywords = keywords
    .replace(/שכונת?/g, ' ')
    .replace(/(\d+(?:[.,]\d)?)\s*חדרים?/g, ' ')
    .replace(/(?:עד|מעל|from|above|over|under|below|max|min)\s*\d+(?:[.,]\d+)?\s*(?:מיליון|million|אלף|k|thousand)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { city, neighborhood, rooms, property_type, listing_type, min_price: min, max_price: max, keywords };
}
