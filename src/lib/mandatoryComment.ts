/**
 * mandatoryComment (client mirror of supabase/functions/_shared/mandatoryComment.ts)
 * --------------------------------------------------------------------------------
 * HARD RULE: every Facebook post Realtyz publishes carries a first comment with
 * the official contact line and its tracking short link.
 */
export const MANDATORY_COMMENT_LINK = 'https://realtyz.co.il/r/94mp59n9';
export const MANDATORY_FIRST_COMMENT = `מוזמנים לפנות אליי: ${MANDATORY_COMMENT_LINK}`;

export function ensureMandatoryComment(text: string | null | undefined): string {
  const base = String(text ?? '').trim();
  if (!base) return MANDATORY_FIRST_COMMENT;
  if (base.includes(MANDATORY_COMMENT_LINK)) return base;
  const cleaned = base
    .split(/\n+/)
    .filter((line) => !/(wa\.me\/|api\.whatsapp\.com|realtyz\.co\.il\/r\/)/i.test(line))
    .join('\n')
    .trim();
  return cleaned ? `${cleaned}\n\n${MANDATORY_FIRST_COMMENT}` : MANDATORY_FIRST_COMMENT;
}
