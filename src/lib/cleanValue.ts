/**
 * Display guard for scraped property values.
 *
 * Yad2 / Homely payloads carry internal identifiers, hashes, JSON fragments and
 * debug keys next to the real data. Anything that is not a human-readable value
 * must never reach a property page or a public payload.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;
const TOKENISH_RE = /^[A-Za-z0-9_-]{24,}$/;

/** True when the raw value is an identifier / debug artefact, not real content. */
export function isJunkValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'boolean' || typeof value === 'number') return false;
  if (Array.isArray(value)) return value.every((v) => isJunkValue(v));
  if (typeof value === 'object') return true; // nested blobs are never rendered as a value

  const raw = String(value).trim();
  if (!raw) return true;
  if (raw === 'null' || raw === 'undefined' || raw === 'NaN' || raw === '[object Object]') return true;
  if (UUID_RE.test(raw)) return true;
  if (LONG_HEX_RE.test(raw)) return true;
  if (/[{}]|"\s*:\s*|\[object/.test(raw)) return true;
  if (/^https?:\/\//i.test(raw) && /token|signature|apikey|api_key/i.test(raw)) return true;
  // Long opaque ASCII strings with no spaces and no Hebrew are always internal.
  if (!/[\u0590-\u05FF\s]/.test(raw) && TOKENISH_RE.test(raw)) return true;
  return false;
}

/** Returns a clean printable value, or null when the value must be hidden. */
export function cleanDisplayValue(value: unknown): string | null {
  if (isJunkValue(value)) return null;
  if (typeof value === 'boolean') return value ? 'יש' : 'אין';
  if (Array.isArray(value)) {
    const parts = value.filter((v) => !isJunkValue(v)).map((v) => String(v).trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * True when a description is only the auto-generated "city · neighborhood"
 * headline (or a bare number), i.e. not a real description.
 */
export function isPlaceholderText(text: unknown, title?: unknown): boolean {
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const v = norm(text);
  if (!v) return true;
  if (v.length < 12) return true;
  if (/^[\d.,\s·-]+$/.test(v)) return true;
  if (title && v === norm(title)) return true;
  // "עיר · שכונה" style headline with no sentence content.
  return /^[^·]{1,30}·[^·]{1,40}$/.test(v);
}
