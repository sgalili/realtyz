// Numeric accuracy helpers for property measurements.
//
// Sources (Yad2 / Homely / scraped HTML) sometimes glue two numbers together
// ("קומה 2" + "80 מ״ר" -> "280") or send a floor as "2 מתוך 5". These helpers
// always produce a single, plausible number so the UI never shows an inflated
// value such as 280 מ״ר for an 80 מ״ר apartment.

const numTokens = (raw: unknown): string[] => {
  const s = String(raw ?? '')
    // Thousands separators only (1,250 -> 1250); a comma between values keeps
    // acting as a separator.
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  return s.match(/\d+(?:\.\d+)?/g) ?? [];
};

/**
 * Split a glued area value such as 7124 ("7 floors in building" + "124 m²")
 * into its two parts. Returns the floors count only when the value is clearly
 * glued (out of plausible area range).
 */
export function splitGluedSqm(raw: unknown): { sqm: number | null; floorsInBuilding: number | null } {
  const tokens = numTokens(raw).map(Number).filter((n) => Number.isFinite(n));
  if (tokens.length === 0) return { sqm: null, floorsInBuilding: null };
  const plausible = tokens.filter((n) => n >= 8 && n <= 2000);
  if (plausible.length > 0) return { sqm: plausible[0], floorsInBuilding: null };
  const first = Math.trunc(tokens[0]);
  const digits = String(first);
  if (digits.length >= 4) {
    const lead = Number(digits.slice(0, digits.length - 3));
    const tail = Number(digits.slice(-3));
    if (tail >= 20 && tail <= 2000 && lead >= 1 && lead <= 60) {
      return { sqm: tail, floorsInBuilding: lead };
    }
  }
  if (digits.length === 3) {
    const tail = Number(digits.slice(1));
    if (tail >= 8 && tail <= 2000) return { sqm: tail, floorsInBuilding: Number(digits[0]) };
  }
  return { sqm: null, floorsInBuilding: null };
}

/** Living area in m² — plausible range 8..2000, never a glued value. */
export function sanitizeSqm(raw: unknown): number | null {
  return splitGluedSqm(raw).sqm;
}

/** Floors in the building, when it can be derived from a glued area value. */
export function floorsInBuildingFromSqm(raw: unknown): number | null {
  return splitGluedSqm(raw).floorsInBuilding;
}


/** Floor number — handles "קומה 2 מתוך 5", "2/5", "קרקע". */
export function sanitizeFloor(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/קרקע|ground/i.test(s)) return 0;
  const tokens = numTokens(s).map(Number).filter((n) => Number.isFinite(n));
  if (tokens.length === 0) return null;
  const first = tokens[0];
  return first >= -3 && first <= 80 ? Math.trunc(first) : null;
}

/** Rooms — 1..20, keeps halves (3.5). */
export function sanitizeRooms(raw: unknown): number | null {
  const tokens = numTokens(raw).map(Number).filter((n) => Number.isFinite(n));
  const hit = tokens.find((n) => n >= 1 && n <= 20);
  return hit ?? null;
}

/**
 * Clean a display value for a numeric attribute row by its Hebrew label.
 * Returns the original string when the label is not a measurement.
 */
export function cleanMeasurementValue(label: string, raw: string): string {
  const name = String(label || '');
  if (/מ״ר|מ"ר|שטח/.test(name)) {
    const v = sanitizeSqm(raw);
    return v === null ? raw : String(v);
  }
  if (/קומה|קומות/.test(name)) {
    const v = sanitizeFloor(raw);
    return v === null ? raw : String(v);
  }
  if (/חדרים/.test(name)) {
    const v = sanitizeRooms(raw);
    return v === null ? raw : String(v);
  }
  if (/חניות|מרפסות/.test(name)) {
    const m = numTokens(raw)[0];
    return m ?? raw;
  }
  return raw;
}

/** Hebrew-only property type label; English tokens are never surfaced. */
export function hebrewPropertyType(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    apartment: 'דירה',
    flat: 'דירה',
    condo: 'דירה',
    penthouse: 'פנטהאוז',
    duplex: 'דופלקס',
    studio: 'סטודיו',
    garden_apartment: 'דירת גן',
    'garden apartment': 'דירת גן',
    house: 'בית פרטי',
    villa: 'וילה',
    cottage: 'קוטג׳',
    lot: 'מגרש',
    land: 'מגרש',
    office: 'משרד',
    store: 'חנות',
    commercial: 'נכס מסחרי',
  };
  if (map[s]) return map[s];
  // Any value that still contains Latin letters is dropped (never shown).
  if (/[a-z]/i.test(s)) return 'דירה';
  return String(raw ?? '').trim() || 'דירה';
}

/** Drop any token containing Latin letters from a Hebrew keyword line. */
export function hebrewOnlyParts(parts: string[]): string[] {
  return parts.filter((p) => p && !/[A-Za-z]/.test(p));
}
