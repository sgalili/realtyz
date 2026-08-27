/**
 * Permanent image blocklist for listings.
 *
 * When a broker deletes a photo from a property we must never show it again,
 * even if a later sync (Yad2 / Homely / Facebook / re-scrape) re-imports the
 * same URL. The canonical blocklist lives on
 * `listings.source_metadata.removed_photo_keys` and a DB trigger strips those
 * keys from every gallery array on write. These helpers keep the client in sync
 * with the same key logic.
 */

/** Canonical key for a media URL: filename, lowercased, query string stripped. */
export function mediaKey(url: string): string {
  const clean = String(url || '').split('?')[0];
  const file = clean.split('/').pop() || clean;
  return file.trim().toLowerCase() || clean.trim().toLowerCase();
}

export function blockedKeysFrom(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).removed_photo_keys;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => (v.includes('/') || v.includes('?') ? mediaKey(v) : v.trim().toLowerCase()));
}

/** Drop every URL whose key appears in the listing blocklist. */
export function filterBlockedPhotos<T extends string>(photos: T[], meta: unknown): T[] {
  const blocked = new Set(blockedKeysFrom(meta));
  if (blocked.size === 0) return photos;
  return photos.filter((u) => !blocked.has(mediaKey(u)));
}

/**
 * Merge the previous blocklist with the keys of photos removed in this edit.
 * `before` / `after` are the galleries as displayed to the user.
 */
export function nextBlockedKeys(meta: unknown, before: string[], after: string[]): string[] {
  const kept = new Set(after.map(mediaKey));
  const removed = before.map(mediaKey).filter((k) => k && !kept.has(k));
  return Array.from(new Set([...blockedKeysFrom(meta), ...removed]));
}
