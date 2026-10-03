/**
 * mandatoryComment (client mirror of supabase/functions/_shared/mandatoryComment.ts)
 * --------------------------------------------------------------------------------
 * HARD RULE: every Facebook post Realtyz publishes carries a first comment with
 * the official contact line and its tracking short link.
 */
export const MANDATORY_COMMENT_LINK = 'https://realtyz.co.il/r/94mp59n9';
export const CANONICAL_CONTACT_PREFIX = 'לחצו ודברו איתי ישירות';
export const MANDATORY_FIRST_COMMENT = `${CANONICAL_CONTACT_PREFIX}: ${MANDATORY_COMMENT_LINK}`;

/** Repairs broken emoji sequences (lone surrogates, U+FFFD, orphan VS16/ZWJ, "🛠 ️" splits). */
export function repairEmojis(input: string | null | undefined): string {
  return String(input ?? '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/(\p{Extended_Pictographic})[ \t]+\uFE0F/gu, '$1\uFE0F')
    .replace(/(^|[^\p{Extended_Pictographic}\u20E3])\uFE0F/gmu, '$1')
    .replace(/(^|\s)\u200D|\u200D(?=\s|$)/gmu, '$1')
    .replace(/^[ \t]+/gm, (m) => m)
    .replace(/[ \t]{2,}/g, ' ');
}

const CONTACT_LINE_RE = /(wa\.me\/|api\.whatsapp\.com|m\.me\/|realtyz\.co\.il\/(r|p)\/|מוזמנים לפנות אליי|לחצו ודברו איתי ישירות|לפרטים ויצירת קשר)/i;

/**
 * Builds the first comment: repaired emojis, duplicate lines and redundant
 * contact/link lines removed, ending with exactly one canonical contact line.
 * A destination link (the poster's own tracked link) replaces the fallback.
 */
export function ensureMandatoryComment(text: string | null | undefined, destination?: string | null): string {
  const dest = String(destination ?? '').trim();
  const existing = String(text ?? '').match(/https?:\/\/realtyz\.co\.il\/r\/[A-Za-z0-9]+/)?.[0];
  const link = dest || existing || MANDATORY_COMMENT_LINK;
  const line = `${CANONICAL_CONTACT_PREFIX}: ${link}`;
  const seen = new Set<string>();
  const cleaned = repairEmojis(text)
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return true;
      if (CONTACT_LINE_RE.test(l)) return false;
      const key = l.replace(/[\p{Extended_Pictographic}\uFE0F\s]/gu, '');
      if (!key || seen.has(key)) return !key && false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned ? `${cleaned}\n\n${line}` : line;
}
