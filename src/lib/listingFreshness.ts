/**
 * Listing freshness helper.
 * A property counts as "new" when it was published (or first imported)
 * within the last 7 days. Used for the "חדש" badge on cards + table rows
 * and for the sidebar Yad2 counter.
 */
export const NEW_WINDOW_DAYS = 7;

const NEW_WINDOW_MS = NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function toTime(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Best-effort publish timestamp across local rows and external payloads. */
export function listingPublishedAt(r: any): number | null {
  const raw = (r?.raw ?? {}) as any;
  const meta = (raw?.source_metadata ?? {}) as any;
  const candidates = [
    raw.published_at, raw.publish_date, raw.date, raw.updated_at_source,
    meta.published_at, meta.date,
    r?.created_at, raw.created_at,
  ];
  for (const c of candidates) {
    const t = toTime(c);
    if (t) return t;
  }
  return null;
}

export function isNewListing(r: any): boolean {
  const t = listingPublishedAt(r);
  if (!t) return false;
  return Date.now() - t <= NEW_WINDOW_MS;
}
