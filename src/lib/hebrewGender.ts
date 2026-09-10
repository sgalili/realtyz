/**
 * hebrewGender
 * ------------
 * Hebrew is a gendered language: every verb, adjective and pronoun changes for
 * a male or a female recipient. This module is the single source of truth for
 * resolving a contact's gender and for writing correct Hebrew to them.
 *
 * Resolution order: the explicit `leads.gender` column, then the legacy
 * `preferences.gender` value, then a first-name heuristic (never a guess about
 * anything else).
 */
export type HebrewGender = 'male' | 'female';

/** Common Israeli female first names that do NOT end with a feminine suffix. */
const FEMALE_NAMES = new Set([
  'רות', 'אסתר', 'מרים', 'שרון', 'יעל', 'איריס', 'שיר', 'תמר', 'ליאור', 'רחל',
  'נועם', 'אור', 'מיכל', 'אביגיל', 'אורית', 'סמדר', 'דגנית', 'שירן', 'ענת', 'גל',
  'נעמי', 'חן', 'רון', 'עדן', 'רעות', 'שני', 'סיון', 'לימור', 'מאיה', 'נטלי',
  'ריטה', 'שגית', 'הילה', 'טל', 'קרן', 'ליהי', 'רימון', 'אפרת', 'זהבית', 'עינת',
]);

/** Male names that end with a feminine-looking suffix and must not be misread. */
const MALE_NAMES = new Set([
  'יהודה', 'משה', 'נחמיה', 'עזריה', 'ירמיה', 'שלמה', 'נתנאל', 'אליה', 'זכריה',
  'חנניה', 'ישעיה', 'עובדיה', 'אריה', 'נוריאל', 'שמריה', 'עמיחי', 'אלישע',
]);

/** Best-effort gender from a Hebrew first name. Returns null when unclear. */
export function guessGenderFromHebrewName(fullName?: string | null): HebrewGender | null {
  const first = String(fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || !/[\u0590-\u05FF]/.test(first)) return null;
  if (MALE_NAMES.has(first)) return 'male';
  if (FEMALE_NAMES.has(first)) return 'female';
  if (/(ה|ת|ית|לי)$/.test(first)) return 'female';
  return null;
}

/** Resolves the gender to write in, from a CRM contact row. */
export function resolveLeadGender(lead: {
  gender?: string | null;
  full_name?: string | null;
  preferences?: Record<string, unknown> | null;
} | null | undefined): HebrewGender | null {
  const direct = String(lead?.gender ?? '').toLowerCase();
  if (direct === 'male' || direct === 'female') return direct;
  const pref = String((lead?.preferences as any)?.gender ?? '').toLowerCase();
  if (pref === 'male' || pref === 'female') return pref;
  return guessGenderFromHebrewName(lead?.full_name);
}

/** Hebrew labels for the CRM picker. */
export const GENDER_LABELS: Record<HebrewGender, string> = {
  male: 'זכר',
  female: 'נקבה',
};
