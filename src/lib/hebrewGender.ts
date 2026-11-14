/**
 * hebrewGender
 * ------------
 * Hebrew is a gendered language: every verb, adjective and pronoun changes for
 * a male or a female recipient. This module is the single source of truth for
 * resolving a contact's gender and for writing correct Hebrew to them.
 *
 * Resolution order: the explicit `leads.gender` column, then the legacy
 * `preferences.gender` value, unknown remains neutral.
 */
export type HebrewGender = 'male' | 'female';

/** Compatibility helper: names are not evidence of a person's gender. */
export function guessGenderFromHebrewName(_fullName?: string | null): HebrewGender | null {
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
  const pref = String(lead?.preferences?.gender ?? '').toLowerCase();
  if (pref === 'male' || pref === 'female') return pref;
  return null;
}

/** Hebrew labels for the CRM picker. */
export const GENDER_LABELS: Record<HebrewGender, string> = {
  male: 'גבר',
  female: 'אישה',
};
