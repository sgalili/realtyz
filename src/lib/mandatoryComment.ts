/**
 * mandatoryComment (client mirror of supabase/functions/_shared/mandatoryComment.ts)
 * --------------------------------------------------------------------------------
 * HARD RULE: every Facebook post Realtyz publishes carries a first comment with
 * the official contact line and its tracking short link.
 */
export const MANDATORY_COMMENT_LINK = 'https://realtyz.co.il/r/94mp59n9';
export const MANDATORY_FIRST_COMMENT = `מוזמנים לפנות אליי: ${MANDATORY_COMMENT_LINK}`;

/**
 * When a destination link is supplied (the poster's own tracked property /
 * partner link) it replaces the generic fallback, so the first comment always
 * points at the specific partner who published. The generic link is used only
 * when no destination exists.
 */
export function ensureMandatoryComment(text: string | null | undefined, destination?: string | null): string {
  const base = String(text ?? '').trim();
  const dest = String(destination ?? '').trim();
  const link = dest || MANDATORY_COMMENT_LINK;
  const line = dest ? `לפרטים ויצירת קשר: ${dest}` : MANDATORY_FIRST_COMMENT;
  if (!base) return line;
  if (base.includes(link)) return base;
  const cleaned = base
    .split(/\n+/)
    .filter((l) => !/(wa\.me\/|api\.whatsapp\.com|realtyz\.co\.il\/(r|p)\/)/i.test(l))
    .join('\n')
    .trim();
  return cleaned ? `${cleaned}\n\n${line}` : line;
}
