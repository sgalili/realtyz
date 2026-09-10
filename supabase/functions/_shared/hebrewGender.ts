// ============================================================
// hebrewGender
// ------------------------------------------------------------
// Hebrew inflects verbs, adjectives and pronouns for the person being spoken
// to. Every AI surface that writes to a contact MUST know whether to use the
// masculine (אתה / מוערך / תראה) or the feminine (את / מוערכת / תראי) forms.
//
// Resolution order: the explicit `leads.gender` column, then the legacy
// `preferences.gender` value, then a Hebrew first-name heuristic. Unknown stays
// unknown — the prompt then instructs neutral phrasing rather than a guess.
// ============================================================

export type HebrewGender = "male" | "female";

const FEMALE_NAMES = new Set([
  "רות", "אסתר", "מרים", "שרון", "יעל", "איריס", "שיר", "תמר", "ליאור", "רחל",
  "נועם", "אור", "מיכל", "אביגיל", "אורית", "סמדר", "דגנית", "שירן", "ענת", "גל",
  "נעמי", "חן", "רון", "עדן", "רעות", "שני", "סיון", "לימור", "מאיה", "נטלי",
  "ריטה", "שגית", "הילה", "טל", "קרן", "ליהי", "אפרת", "זהבית", "עינת",
]);

const MALE_NAMES = new Set([
  "יהודה", "משה", "נחמיה", "עזריה", "ירמיה", "שלמה", "נתנאל", "אליה", "זכריה",
  "חנניה", "ישעיה", "עובדיה", "אריה", "נוריאל", "שמריה", "עמיחי", "אלישע",
]);

/** Best-effort gender from a Hebrew first name. Returns null when unclear. */
export function guessGenderFromHebrewName(fullName?: string | null): HebrewGender | null {
  const first = String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || !/[\u0590-\u05FF]/.test(first)) return null;
  if (MALE_NAMES.has(first)) return "male";
  if (FEMALE_NAMES.has(first)) return "female";
  if (/(ה|ת|ית|לי)$/.test(first)) return "female";
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
  const pref = String((lead?.preferences as any)?.gender ?? "").toLowerCase();
  if (pref === "male" || pref === "female") return pref as HebrewGender;
  return guessGenderFromHebrewName(lead?.full_name);
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
