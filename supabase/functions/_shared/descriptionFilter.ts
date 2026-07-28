/**
 * Shared boilerplate filter for scraped property descriptions.
 *
 * Yad2 / Homely / WebTiv pages leak cookie-consent banners, legal warnings and
 * generic UI chrome into the free-text description fields. Anything matching
 * these patterns is NOT a property description and must be discarded before it
 * ever reaches the database.
 */

const BOILERPLATE_RE = [
  /אנחנו משתמשים בעוגיות/,
  /עוגיות|קובצי\s*cookie|cookies?\b/i,
  /מדיניות\s*(ה)?פרטיות|תנאי\s*שימוש|תקנון\s*האתר/,
  /כל\s*הזכויות\s*שמורות/,
  /אישור\s*כל\s*העוגיות|הגדרות\s*עוגיות|קבל(ת)?\s*עוגיות/,
  /accept\s+(all\s+)?cookies|cookie\s+(policy|consent|settings)/i,
  /privacy\s+policy|terms\s+of\s+(use|service)/i,
  /נא\s*להפעיל\s*javascript|enable\s+javascript/i,
  /הדפדפן\s*שלך|browser\s+is\s+not\s+supported/i,
  /שים\s*לב[!:]?\s*(אין|אסור)|אזהרה[:!]/,
  /לוח\s*מודעות|יד\s?2\s*בע"?מ/,
  /התחבר(ות)?\s*לאתר|הרשמה\s*לאתר|צור\s*קשר\s*עם\s*התמיכה/,
  /דיווח\s*על\s*מודעה|מודעה\s*זו\s*הוסרה/,
];

/** True when the text is cookie/legal/UI boilerplate rather than a description. */
export function isBoilerplateDescription(text: string | null | undefined): boolean {
  const v = (text ?? "").replace(/\s+/g, " ").trim();
  if (!v) return true;
  return BOILERPLATE_RE.some((re) => re.test(v));
}

/** Returns the text when it is a real description, otherwise null. */
export function sanitizeDescription(
  text: string | null | undefined,
  minLength = 20,
): string | null {
  const v = (text ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!v || v.length < minLength) return null;
  if (isBoilerplateDescription(v)) return null;
  return v;
}
