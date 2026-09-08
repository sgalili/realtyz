/**
 * UTF-8 hygiene for post text, group names and anything else that travels
 * between the browser, the database and the Chrome extension.
 *
 * Emoji and Hebrew break in two ways:
 *  1. Mojibake — UTF-8 bytes that were decoded as Latin-1 somewhere upstream
 *     ("ð\u009f\u0092\u00a1" instead of "💡"). We re-decode those bytes.
 *  2. Lone surrogates — a half of an emoji pair that survived a substring cut.
 *     Postgres rejects them and JSON.stringify turns them into U+FFFD.
 */

const MOJIBAKE_RE = /[\u00c2-\u00f4][\u0080-\u00bf]{1,3}/;

/** Re-decode text that was mistakenly read as Latin-1. */
function undoMojibake(text: string): string {
  if (!MOJIBAKE_RE.test(text)) return text;
  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xff) return text; // mixed content — leave it alone
      bytes[i] = code;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.includes('\uFFFD') ? text : decoded;
  } catch {
    return text;
  }
}

/** Drop unpaired surrogates so emoji never degrade into "?" / U+FFFD. */
function dropLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/**
 * Normalize any user- or AI-authored text before it is stored, queued or
 * rendered. Emoji, Hebrew and RTL marks pass through untouched.
 */
export function safeUtf8(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  let text = String(input);
  text = undoMojibake(text);
  text = dropLoneSurrogates(text);
  // Replacement characters carry no information and only pollute the output.
  text = text.replace(/\uFFFD/g, '');
  // Zero-width junk pasted from Word / Facebook.
  text = text.replace(/[\u200B\u200C\uFEFF]/g, '');
  return text.normalize('NFC');
}

/** Same as safeUtf8 but preserves null (for optional DB columns). */
export function safeUtf8OrNull(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const out = safeUtf8(input);
  return out.length ? out : null;
}

/** Truncate without splitting an emoji in half. */
export function safeUtf8Slice(input: string | null | undefined, max: number): string {
  const text = safeUtf8(input);
  if (text.length <= max) return text;
  return dropLoneSurrogates(text.slice(0, max)).trimEnd();
}
