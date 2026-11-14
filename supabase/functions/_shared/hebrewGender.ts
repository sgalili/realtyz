// ============================================================
// hebrewGender
// ------------------------------------------------------------
// Hebrew inflects verbs, adjectives and pronouns for the person being spoken
// to. Every AI surface that writes to a contact MUST know whether to use the
// masculine (אתה / מוערך / תראה) or the feminine (את / מוערכת / תראי) forms.
//
// Resolution order: the explicit `leads.gender` column, then the legacy
// `preferences.gender` value. Unknown stays
// unknown — the prompt then instructs neutral phrasing rather than a guess.
// ============================================================

export type HebrewGender = "male" | "female";

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
  const direct = String(lead?.gender ?? "").toLowerCase();
  if (direct === "male" || direct === "female") return direct as HebrewGender;
  const pref = String(lead?.preferences?.gender ?? "").toLowerCase();
  if (pref === "male" || pref === "female") return pref as HebrewGender;
  return null;
}

/**
 * Mandatory Hebrew-grammar block appended to every lead-facing prompt so the
 * model conjugates for the actual recipient instead of defaulting to masculine.
 */
export function genderPromptBlock(gender: HebrewGender | null, name?: string | null): string {
  const who = String(name ?? "").trim();
  const subject = who ? `${who}` : "הנמען";
  if (gender === "female") {
    return `דקדוק עברי (חובה): ${subject} היא אישה. כתבי אליה בלשון נקבה בלבד: את, שלך, תראי, רוצה, מוערכת, מעניין אותך, בואי, נוח לך. אסור להשתמש בצורות זכר (אתה, תראה, מוערך, בוא).`;
  }
  if (gender === "male") {
    return `דקדוק עברי (חובה): ${subject} הוא גבר. כתבי אליו בלשון זכר בלבד: אתה, שלך, תראה, מוערך, בוא. אסור להשתמש בצורות נקבה (את, תראי, מוערכת, בואי).`;
  }
  return `דקדוק עברי (חובה): מגדר ${subject} אינו ידוע. נסחי בצורה ניטרלית (שם פרטי, "מה נוח", "אפשר לתאם") ואל תניחי לשון זכר כברירת מחדל.`;
}
