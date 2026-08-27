/**
 * Listing freshness helper.
 * "חדש" = published (or first seen) within the last 48 hours.
 * "ותיק" = originally published 6 months ago or more.
 */
export const NEW_WINDOW_HOURS = 48;
export const OLD_WINDOW_MONTHS = 6;

const NEW_WINDOW_MS = NEW_WINDOW_HOURS * 60 * 60 * 1000;
const OLD_WINDOW_MS = OLD_WINDOW_MONTHS * 30 * 24 * 60 * 60 * 1000;


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

/**
 * Publish timestamp reported by the ORIGINAL source listing only.
 * Never falls back to our own import timestamps, so the table shows the real
 * ad date instead of "today" for freshly imported rows.
 */
export function listingSourcePublishedAt(r: any): number | null {
  const raw = (r?.raw ?? {}) as any;
  const meta = (raw?.source_metadata ?? {}) as any;
  const candidates = [
    raw.published_at, raw.publish_date, raw.date, raw.updated_at_source,
    meta.published_at, meta.publish_date, meta.date_published, meta.original_published_at,
    meta.posted_at, meta.date, meta.published_text, meta.updated_at_source,
    r?.published_at,
  ];
  for (const c of candidates) {
    const t = toTime(c);
    if (t) return t;
  }
  return null;
}

/** Best-effort publish timestamp across local rows and external payloads. */
export function listingPublishedAt(r: any): number | null {
  const fromSource = listingSourcePublishedAt(r);
  if (fromSource) return fromSource;
  const raw = (r?.raw ?? {}) as any;
  for (const c of [raw.first_seen_at, r?.created_at, raw.created_at]) {
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
