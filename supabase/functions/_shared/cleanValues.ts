/**
 * Payload guard for scraped listing data.
 *
 * Public/API responses must expose only clean, readable, real values. Internal
 * identifiers, hashes, tokens and debug keys coming from the Yad2 / Homely
 * ingestion are stripped here before anything leaves the backend.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;
const TOKENISH_RE = /^[A-Za-z0-9_-]{24,}$/;

/** Keys that are always internal plumbing, whatever their value. */
const JUNK_KEYS = new Set([
  "uuid", "token", "access_token", "refresh_token", "apikey", "api_key", "secret",
  "orderid", "order_id", "categoryid", "category_id", "subcategoryid", "subcategory_id",
  "customerid", "customer_id", "sessionid", "session_id", "requestid", "request_id",
  "trace", "traceid", "debug", "raw", "raw_html", "html", "cookies", "headers",
  "scrape_token", "brightdata_response", "snapshot_id", "texteng", "hash",
  "removed_photo_keys", "media_vision_checked", "media_vision_at", "metadata_backfilled_at",
  "fetched_at", "created_at", "updated_at", "source_metadata", "sources", "source_url",
  "external_id", "last_manual_yad2_sync_at",
]);

function isJunkKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (JUNK_KEYS.has(k)) return true;
  return /(^|_)(token|secret|apikey|debug)(_|$)/.test(k);
}

function isJunkScalar(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (raw === "null" || raw === "undefined" || raw === "NaN" || raw === "[object Object]") return true;
  if (UUID_RE.test(raw)) return true;
  if (LONG_HEX_RE.test(raw)) return true;
  if (/\[object /.test(raw)) return true;
  if (/^https?:\/\//i.test(raw) && /token|signature|apikey|api_key/i.test(raw)) return true;
  if (!/[\u0590-\u05FF\s]/.test(raw) && TOKENISH_RE.test(raw)) return true;
  return false;
}

/**
 * Recursively removes internal identifiers and debug artefacts. Real values
 * (numbers, Hebrew/English text, URLs, dates, photo arrays) pass through
 * untouched.
 */
export function cleanPayload<T>(input: T, depth = 0): T {
  if (input == null || depth > 6) return input;
  if (typeof input === "string") return (isJunkScalar(input) ? null : input) as T;
  if (typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input
      .map((v) => cleanPayload(v, depth + 1))
      .filter((v) => v !== null && v !== undefined) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isJunkKey(key)) continue;
    const cleaned = cleanPayload(value, depth + 1);
    if (cleaned === null || cleaned === undefined) continue;
    if (typeof cleaned === "object" && !Array.isArray(cleaned) && !Object.keys(cleaned as object).length) continue;
    out[key] = cleaned;
  }
  return out as T;
}
