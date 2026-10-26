/**
 * mandatoryComment (client mirror of supabase/functions/_shared/mandatoryComment.ts)
 * --------------------------------------------------------------------------------
 * HARD RULE: every Facebook post TORAFF publishes carries a first comment with
 * the official contact line and its tracking short link.
 */
export const MANDATORY_COMMENT_LINK = 'https://toraff.co.il/r/94mp59n9';
export const CANONICAL_CONTACT_PREFIX = 'לחצו ודברו איתי ישירות';
export const MANDATORY_FIRST_COMMENT = `${CANONICAL_CONTACT_PREFIX}:\n${MANDATORY_COMMENT_LINK}`;

/** Repairs broken emoji sequences (lone surrogates, U+FFFD, orphan VS16/ZWJ, "🛠 ️" splits). */
export function repairEmojis(input: string | null | undefined): string {
  return String(input ?? '')
    .replace(/^([ \t]*)(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\uFFFD|\?(?=\s))+[ \t]*/gm, '$1💬 ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/(\p{Extended_Pictographic})[ \t]+\uFE0F/gu, '$1\uFE0F')
    .replace(/(^|[^\p{Extended_Pictographic}\u20E3])\uFE0F/gmu, '$1')
    .replace(/(^|\s)\u200D|\u200D(?=\s|$)/gmu, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}


/** Rita identity: first name only ("ריטה"), never a surname; one brief AI disclosure. */
export const RITA_DISCLOSURE = 'ריטה, סוכנת ה-AI של TORAFF';
export function enforceRitaIdentity(input: string | null | undefined): string {
  let t = String(input ?? '')
    .replace(/ריטה[ \t]+גלילי/g, 'ריטה')
    .replace(/\bRita[ \t]+Galili\b/gi, 'ריטה')
    .replace(/\bRita\b/g, 'ריטה')
    .replace(/(ריטה)[ \t]+(?:גלילי|Galili)/gi, '$1');
  if (!/ריטה/.test(t)) return t;
  const discRe = /(?:ריטה[,\s]*)?(?:סוכנת|הסוכנת|סוכן)\s*(?:ה-?\s*)?AI(?:\s*(?:הרשמית\s*)?של\s*(?:TORAFF|רילטיז|המשרד))?/g;
  let count = 0;
  t = t.replace(discRe, (m) => (count++ === 0 ? RITA_DISCLOSURE : '')).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+,/g, ',');
  return t;
}

const CONTACT_LINE_RE = /(wa\.me\/|api\.whatsapp\.com|m\.me\/|(?:toraff|realtyz|realtys)\.co\.il\/(r|p)\/|מוזמנים לפנות אליי|לחצו ודברו איתי ישירות|לפרטים ויצירת קשר)/i;

/**
 * Builds the first comment: repaired emojis, duplicate lines and redundant
 * contact/link lines removed, ending with exactly one canonical contact line.
 * A destination link (the poster's own tracked link) replaces the fallback.
 */
export function ensureMandatoryComment(text: string | null | undefined, destination?: string | null): string {
  const dest = String(destination ?? '').trim();
  const existing = String(text ?? '').match(/https?:\/\/(?:toraff|realtyz|realtys)\.co\.il\/r\/[A-Za-z0-9]+/)?.[0];
  const link = (dest || existing || MANDATORY_COMMENT_LINK).replace(/https?:\/\/(?:realtyz|realtys)\.co\.il\/r\//gi, 'https://toraff.co.il/r/');
  const line = `${CANONICAL_CONTACT_PREFIX}:\n${link}`;
  const seen = new Set<string>();
  const cleaned = enforceRitaIdentity(repairEmojis(text))
    .split(/\n/)
    .flatMap((l) => {
      const m = l.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com|m\.me)\/\S+/i);
      if (!m) return [l.trim()];
      const pre = l.slice(0, m.index).replace(/[:：\-–—\s]+$/, '').trim();
      return pre && !CONTACT_LINE_RE.test(pre) ? [pre, m[0]] : [m[0]];
    })
    .filter((l) => {
      if (!l) return true;
      if (CONTACT_LINE_RE.test(l)) return false;
      const key = l.replace(/[\p{Extended_Pictographic}\uFE0F\s]/gu, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned ? `${cleaned}\n\n${line}` : line;
}
