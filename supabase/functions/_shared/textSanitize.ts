// Pure text helpers shared by edge functions (AI copy sanitizers,
// language detection, markdown stripping). No network calls, no DB access.

// Inline conservative street-number scrubber (mirrors owner-laws.ts so we
// don't pull a circular import). HARD LAW #1: never expose building numbers.
const _STREET_KW = /(רחוב|רח['׳]?|שדרות|שד['׳]?|דרך|טיילת|סמטת|סמטה|ככר|כיכר)/;
const _TRAILING_UNITS =
  /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|ק["׳']?\s*מ|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;
function _stripStreetNumbersInline(s: string): string {
  let out = s;
  out = out.replace(
    new RegExp(
      `(${_STREET_KW.source})\\s+([\\u0590-\\u05FF][\\u0590-\\u05FF״"׳'\\-\\s]{1,40}?)\\s+\\d{1,4}[א-ת]?\\b`,
      "g",
    ),
    (_m, kw, name) => `${kw} ${String(name).trim()}`,
  );
  out = out.replace(
    /(^|[^\d:=״"׳'\u05F4\u05F3])([\u0590-\u05FF]{3,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?\b/g,
    (m, pre, word, _num, offset, full) => {
      const after = String(full).slice(
        offset + m.length,
        offset + m.length + 24,
      );
      if (_TRAILING_UNITS.test(after.trim())) return m;
      if (
        /^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט)$/
          .test(word)
      ) return m;
      return `${pre}${word}`;
    },
  );
  return out;
}

export function sanitizeOutboundText(input: string): string {
  let out = String(input ?? "");
  out = out
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/[—–]+/g, " ")
    .replace(/\*+/g, "")
    .replace(/-{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // HARD LAW #1 — strip building numbers from street addresses.
  out = _stripStreetNumbersInline(out);
  return out;
}

/**
 * Strip markdown emphasis (** bold **, * italics *, __ underline __, _ italics _,
 * ` code `, # headers) from generated text. Use for any AI text that lands in
 * social posts, social comments/replies, email, SMS, or any non-WhatsApp surface.
 * NEVER apply this to WhatsApp Green API output — WA renders `*bold*` natively.
 */
export function stripMarkdownEmphasis(input: string): string {
  let out = String(input ?? "");
  // Bold: **text** or __text__  →  text
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(
    /__([^_\n]+?)__/g,
    "$1",
  );
  // Italics: *text* or _text_  →  text  (avoid touching lone * already gone)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1$2");
  out = out.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1$2");
  // Any leftover stray asterisks/underscores from partial markdown
  out = out.replace(/\*+/g, "").replace(/(^|\s)_+|_+(?=\s|$)/g, "$1");
  // Inline code `x` and leading # headers
  out = out.replace(/`+([^`\n]+?)`+/g, "$1").replace(/^\s{0,3}#{1,6}\s+/gm, "");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

export function detectDominantLanguage(text: string): "he" | "en" | "other" {
  const s = String(text || "");
  const hebrew = (s.match(/[\u0590-\u05FF]/g) ?? []).length;
  const english = (s.match(/[A-Za-z]/g) ?? []).length;
  if (english > hebrew && english >= 3) return "en";
  if (hebrew > english && hebrew >= 2) return "he";
  return "other";
}
