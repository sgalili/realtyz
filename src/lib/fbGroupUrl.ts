/**
 * Single source of truth for Facebook group links.
 *
 * Group references reach us in many shapes: full desktop URLs, mobile
 * (m./mbasic.) URLs, relative hrefs scraped from the DOM ("/groups/123"),
 * permalinks ("/groups/123/posts/456"), or a bare id. Anything stored on a
 * queue row, a pill, or handed to the extension must be an absolute
 * https://www.facebook.com/groups/<id> URL, otherwise the click resolves
 * against our own origin and the extension navigates nowhere.
 */

const GROUP_ID_RE = /(?:facebook\.com|fb\.com)\/groups\/([^/?#\s]+)|(?:^|\/)groups\/([^/?#\s]+)/i;
const BARE_ID_RE = /^[A-Za-z0-9._-]{3,}$/;
const RESERVED = new Set(['joins', 'feed', 'discover', 'create', 'search', 'your_groups']);

/** Extract the group id (numeric or slug) from any group reference. */
export function fbGroupId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim().replace(/^ext:/, '');
  if (!raw) return null;

  const m = raw.match(GROUP_ID_RE);
  let id = m ? m[1] || m[2] : null;

  if (!id && BARE_ID_RE.test(raw) && !raw.includes('.com')) id = raw;
  if (!id) return null;

  try { id = decodeURIComponent(id); } catch { /* keep raw */ }
  id = id.trim();
  if (!id || RESERVED.has(id.toLowerCase())) return null;
  return id;
}

/** Absolute, clickable group URL — or null when the input holds no group id. */
export function fbGroupUrl(input: string | null | undefined): string | null {
  const id = fbGroupId(input);
  return id ? `https://www.facebook.com/groups/${encodeURIComponent(id)}` : null;
}

/**
 * Absolute URL with a fallback id: use the stored URL when it is a real group
 * link, otherwise rebuild it from the id.
 */
export function fbGroupUrlFrom(
  url: string | null | undefined,
  id: string | null | undefined,
): string | null {
  return fbGroupUrl(url) || fbGroupUrl(id);
}

/** True when the string points at a Facebook group (any of the accepted shapes). */
export function isFbGroupRef(input: string | null | undefined): boolean {
  return !!fbGroupId(input);
}
