// Publication / last-update date resolution for listing rows coming from
// Yad2, Homely, WebTiv or the local DB.
import { listingPublishedAt, listingSourcePublishedAt } from '@/lib/listingFreshness';

function toTime(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Most recent known activity: source update date, else publish date. */
export function listingActivityAt(r: any): number | null {
  const raw = (r?.raw ?? {}) as any;
  const meta = (raw?.source_metadata ?? {}) as any;
  const candidates = [
    raw.updated_at_source, raw.updated_at, raw.last_updated, raw.modified_at, raw.date_updated,
    meta.updated_at, meta.last_updated, meta.updated_at_source,
    r?.updated_at,
  ];
  for (const c of candidates) {
    const t = toTime(c);
    if (t) return t;
  }
  return listingPublishedAt(r);
}

/** dd/MM/yyyy for the table cell — the original "פורסם ב-" date from the source. */
export function formatListingDate(r: any): string {
  const t = listingSourcePublishedAt(r) ?? listingPublishedAt(r) ?? listingActivityAt(r);
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
