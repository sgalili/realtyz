/**
 * serviceAreas
 * ------------
 * Curated catalogue of Israeli cities + their well-known neighborhoods used by
 * the "Area of Expertise" picker. Agents can also free-type their own labels,
 * so this is just a starting set, not an exhaustive cadastre.
 *
 * Format on disk (profiles.service_areas: text[]):
 *   ['הרצליה - מרכז', 'תל אביב - צפון הישן', 'רמת גן']
 *
 * The label format is `<עיר> - <שכונה>` for neighborhoods, or just `<עיר>`
 * for an entire city. We use the Hebrew dash-less separator " - " (space dash
 * space) so the persona prompt's no-em-dash rule is preserved.
 */

export const CURATED_SERVICE_AREAS: ReadonlyArray<{ city: string; neighborhoods: string[] }> = [
  {
    city: 'תל אביב',
    neighborhoods: [
      'צפון הישן',
      'צפון החדש',
      'הצפון הצפוני',
      'לב תל אביב',
      'פלורנטין',
      'נווה צדק',
      'יפו העתיקה',
      'רמת אביב',
      'בבלי',
      'כרם התימנים',
      'שפירא',
    ],
  },
  {
    city: 'הרצליה',
    neighborhoods: ['מרכז', 'הרצליה פיתוח', 'נוף ים', 'יד התשעה', 'גבעת הפרחים'],
  },
  {
    city: 'רמת גן',
    neighborhoods: ['מרכז', 'נווה יהושע', 'רמת חן', 'מרום נווה', 'הלל'],
  },
  {
    city: 'גבעתיים',
    neighborhoods: ['בורוכוב', 'גבעת רמב"ם', 'שינקין'],
  },
  {
    city: 'רעננה',
    neighborhoods: ['מרכז', 'רעננה הירוקה', 'נווה זמר'],
  },
  {
    city: 'כפר סבא',
    neighborhoods: ['מרכז', 'נווה ים', 'אלי כהן'],
  },
  {
    city: 'נתניה',
    neighborhoods: ['פולג', 'אגמים', 'עיר ימים', 'רמת פולג', 'מרכז'],
  },
  {
    city: 'ראשון לציון',
    neighborhoods: ['קרית ראשון', 'נחלת יהודה', 'נווה ים'],
  },
  {
    city: 'חולון',
    neighborhoods: ['קרית שרת', 'ג', 'נאות יהודית'],
  },
  {
    city: 'בת ים',
    neighborhoods: ['רמת יוסף', 'מרכז', 'עמידר'],
  },
  {
    city: 'ירושלים',
    neighborhoods: ['רחביה', 'בקעה', 'גרמן קולוני', 'טלביה', 'קטמון', 'ארנונה', 'פסגת זאב'],
  },
  {
    city: 'חיפה',
    neighborhoods: ['כרמל מרכזי', 'דניה', 'אחוזה', 'רמת בגין', 'נווה שאנן', 'הדר'],
  },
  {
    city: 'באר שבע',
    neighborhoods: ['רמות', 'נווה זאב', 'ד', 'הישנה'],
  },
  {
    city: 'מודיעין',
    neighborhoods: ['בוכמן', 'הקטנה', 'המרכז'],
  },
  {
    city: 'אשדוד',
    neighborhoods: ['רובע ה', 'רובע ז', 'מרינה', 'סיטי'],
  },
];

/** Flat list of every "city" or "city - neighborhood" label. */
export const ALL_AREA_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (const { city, neighborhoods } of CURATED_SERVICE_AREAS) {
    out.push(city);
    for (const n of neighborhoods) out.push(`${city} - ${n}`);
  }
  return out;
})();

/** Pretty-print a list of areas for prompts/UI. */
export function formatServiceAreasForPrompt(areas: string[] | null | undefined): string {
  if (!areas || areas.length === 0) return '(לא הוגדר אזור התמחות)';
  return areas.join(', ');
}

/** Extract the city slug from a label like "הרצליה - מרכז". */
export function cityFromArea(area: string): string {
  const ix = area.indexOf(' - ');
  return ix === -1 ? area.trim() : area.slice(0, ix).trim();
}

/**
 * Decide whether a lead/listing's `(city, neighborhood)` is inside the agent's
 * configured service_areas. Matching is intentionally lenient:
 *
 *  - If `service_areas` is empty → everything matches (agent hasn't restricted yet).
 *  - A bare city area "תל אביב" matches any neighborhood inside Tel Aviv.
 *  - A "city - neighborhood" area matches only that exact combo, OR the same
 *    city when `neighborhood` is unknown.
 *
 * Both inputs are trimmed and case-folded; we compare with simple equality
 * because Hebrew has no case.
 */
export function isInServiceArea(
  city: string | null | undefined,
  neighborhood: string | null | undefined,
  serviceAreas: string[] | null | undefined,
): boolean {
  if (!serviceAreas || serviceAreas.length === 0) return true;
  const c = (city ?? '').trim();
  const n = (neighborhood ?? '').trim();
  if (!c) return false;

  for (const raw of serviceAreas) {
    const area = raw.trim();
    if (!area) continue;
    const ix = area.indexOf(' - ');
    if (ix === -1) {
      // Whole-city area
      if (area === c) return true;
    } else {
      const aCity = area.slice(0, ix).trim();
      const aHood = area.slice(ix + 3).trim();
      if (aCity !== c) continue;
      if (!n) return true; // unknown neighborhood, treat as in-area for the city
      if (aHood === n) return true;
    }
  }
  return false;
}
