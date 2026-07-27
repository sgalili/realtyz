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
  const s = String(v).trim();
  // Hebrew source format: "פורסם ב 18/07/26" / "18/07/2026"
  const dm = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dm) {
    const [, d, m, yRaw] = dm;
    const y = Number(yRaw.length === 2 ? `20${yRaw}` : yRaw);
    const t = new Date(y, Number(m) - 1, Number(d)).getTime();
    if (Number.isFinite(t)) return t;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Best-effort publish timestamp across local rows and external payloads. */
export function listingPublishedAt(r: any): number | null {
  const raw = (r?.raw ?? {}) as any;
  const meta = (raw?.source_metadata ?? {}) as any;
  const candidates = [
    raw.published_at, raw.publish_date, raw.first_seen_at, raw.date, raw.updated_at_source,
    meta.published_at, meta.publish_date, meta.date_published, meta.original_published_at,
    meta.posted_at, meta.date, meta.published_text,
    r?.published_at, r?.created_at, raw.created_at,
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
