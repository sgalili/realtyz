// Shared parsing helpers for Hebrew listing addresses and source dates.
// Used by the metadata backfill job so `בית` / `דירה` / `שכונה` and the true
// original publication date are always present on our own rows.

export type ParsedAddress = {
  street: string | null;
  house_number: string | null;
  apartment_number: string | null;
};

const HE_HOUSE_RE = /(?:^|\s)(?:בית|מס['׳]?\s*בית)\s*[:\-]?\s*(\d+[א-ת]?)/;
const HE_APT_RE = /(?:^|\s)(?:דירה|דירת|מס['׳]?\s*דירה|apt\.?)\s*[:\-]?\s*(\d+[א-ת]?)/i;

/**
 * Parses Israeli style free-text addresses:
 *   "התזמורת 2 50"  -> street "התזמורת", house "2", apt "50"
 *   "החלוץ 9"       -> street "החלוץ", house "9"
 *   "הרצל 12 דירה 4"-> street "הרצל", house "12", apt "4"
 */
export function parseHebrewAddress(raw: string | null | undefined): ParsedAddress {
  const out: ParsedAddress = { street: null, house_number: null, apartment_number: null };
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return out;

  let rest = text;

  const aptLabelled = rest.match(HE_APT_RE);
  if (aptLabelled) {
    out.apartment_number = aptLabelled[1];
    rest = rest.replace(aptLabelled[0], ' ');
  }
  const houseLabelled = rest.match(HE_HOUSE_RE);
  if (houseLabelled) {
    out.house_number = houseLabelled[1];
    rest = rest.replace(houseLabelled[0], ' ');
  }

  rest = rest.replace(/[,،]/g, ' ').replace(/\s+/g, ' ').trim();
  const numbers = rest.match(/(?:^|\s)(\d+[א-ת]?)(?=\s|$)/g)?.map((s) => s.trim()) ?? [];

  if (!out.house_number && numbers.length) out.house_number = numbers[0];
  if (!out.apartment_number && numbers.length > 1) out.apartment_number = numbers[1];

  const firstNumIdx = rest.search(/(?:^|\s)\d/);
  const street = (firstNumIdx > 0 ? rest.slice(0, firstNumIdx) : rest.replace(/\d+[א-ת]?/g, '')).trim();
  out.street = street || null;

  // Sanity: apartment/house numbers are never absurdly long.
  if (out.house_number && out.house_number.length > 4) out.house_number = null;
  if (out.apartment_number && out.apartment_number.length > 4) out.apartment_number = null;
  return out;
}

const DMY_RE = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;

/** Normalises any known source date shape to an ISO string, or null. */
export function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  if (!s || /^0+$/.test(s)) return null;

  const dmy = s.match(DMY_RE);
  if (dmy && !/T\d{2}:/.test(s)) {
    const [, dd, mm, yyRaw] = dmy;
    const yy = yyRaw.length === 2 ? Number(yyRaw) + 2000 : Number(yyRaw);
    const d = new Date(Date.UTC(yy, Number(mm) - 1, Number(dd)));
    if (!Number.isNaN(d.getTime())) return sane(d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : sane(d);
}

/** Rejects nonsense dates (future, or before 2000) so we never store "today". */
function sane(d: Date): string | null {
  const t = d.getTime();
  const now = Date.now();
  if (t > now + 86_400_000) return null;
  if (t < Date.UTC(2000, 0, 1)) return null;
  return d.toISOString();
}

const PUBLISHED_KEYS = [
  'published_at', 'publishedAt', 'startdate', 'start_date', 'date_added', 'dateAdded',
  'createdAt', 'created_at', 'uploadDate', 'upload_date', 'first_seen_at', 'publish_date',
];

/** Digs the real original publication date out of any nested source payload. */
export function extractPublishedAt(source: unknown, depth = 0): string | null {
  if (!source || typeof source !== 'object' || depth > 3) return null;
  const obj = source as Record<string, unknown>;
  for (const key of PUBLISHED_KEYS) {
    if (key in obj) {
      const iso = toIsoDate(obj[key]);
      if (iso) return iso;
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const nested = extractPublishedAt(value, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

/** "לפני 3 ימים" / "לפני שבועיים" style relative dates found in scraped HTML. */
export function publishedFromRelativeHebrew(text: string | null | undefined): string | null {
  const s = String(text ?? '');
  const m = s.match(/לפני\s+(\d+)?\s*(יום|ימים|שבוע|שבועות|חודש|חודשים)/);
  if (!m) return null;
  const n = Number(m[1] ?? 1) || 1;
  const unit = m[2];
  const days = unit.startsWith('יום') || unit === 'ימים' ? n
    : unit.startsWith('שבוע') ? n * 7
    : n * 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
