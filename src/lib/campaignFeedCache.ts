/**
 * Shared cache helpers for the published-posts feed.
 *
 * The feed is mirrored into localStorage so /campaigns paints instantly. When a
 * Facebook Page is disconnected, every cached post that belongs to that Page
 * must disappear from the workspace view immediately — before any network call.
 */

export const FEED_CACHE_STORAGE_KEY = 'realtyz.campaigns.feed_rows.v1';

/** Event fired after a single Facebook Page was disconnected. */
export const FB_PAGE_REMOVED_EVENT = 'realtyz:facebook-page-removed';

/** True when a feed row was published by (or imported from) the given Page. */
export function rowBelongsToPage(row: any, pageId: string): boolean {
  const id = String(pageId).trim();
  if (!id) return false;
  const providerId = String(row?.provider_message_id ?? '');
  if (providerId.startsWith(`${id}_`) || providerId === id) return true;
  if (String(row?.target_account_ref ?? '') === id) return true;
  if (String(row?.source_account ?? '') === id) return true;
  return false;
}

/** Drop every cached post of a disconnected Page from local storage. */
export function purgeCachedPostsForPage(pageId: string) {
  try {
    const raw = localStorage.getItem(FEED_CACHE_STORAGE_KEY) || sessionStorage.getItem(FEED_CACHE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return;
    const next: Record<string, any[]> = {};
    Object.entries(parsed as Record<string, any[]>).forEach(([scope, rows]) => {
      next[scope] = Array.isArray(rows) ? rows.filter((r) => !rowBelongsToPage(r, pageId)) : [];
    });
    localStorage.setItem(FEED_CACHE_STORAGE_KEY, JSON.stringify(next));
    sessionStorage.removeItem(FEED_CACHE_STORAGE_KEY);
  } catch {
    /* storage unavailable — the in-memory purge below still applies */
  }
  try {
    window.dispatchEvent(new CustomEvent(FB_PAGE_REMOVED_EVENT, { detail: { pageId: String(pageId) } }));
  } catch {
    /* noop */
  }
}
