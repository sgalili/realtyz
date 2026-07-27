// Resolve a live Yad2 ad URL for a listing row.
// Returns '' when the listing is not from Yad2, has no source URL, or the ad
// is known to be closed / removed / sold — so the button only shows for ads
// that are verified as still active.

function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

const DEAD_STATUSES = ['closed', 'deleted', 'removed', 'expired', 'sold', 'inactive', 'off_market', 'archived', 'נמכר', 'הוסר', 'לא פעיל'];

export function liveYad2Url(row: {
  url?: string | null;
  source?: string | null;
  sources?: string[] | null;
  raw?: any;
}): string {
  const raw = row.raw ?? {};
  const meta = raw.source_metadata && typeof raw.source_metadata === 'object' ? raw.source_metadata : {};

  const url = String(
    row.url ?? pick(raw, ['source_url', 'url', 'ad_url', 'link']) ?? pick(meta, ['source_url', 'url', 'ad_url', 'link']) ?? '',
  ).trim();
  if (!url || !/^https?:\/\//i.test(url)) return '';

  const origin = String(row.source ?? pick(meta, ['source_origin', 'source']) ?? '').toLowerCase();
  const isYad2 = origin.includes('yad2') || (row.sources ?? []).some((s) => String(s).toLowerCase().includes('yad2')) || /yad2\.co\.il/i.test(url);
  if (!isYad2) return '';

  // Explicit "not live" signals from the scraper / DB.
  const status = String(pick(raw, ['ad_status', 'status', 'listing_status']) ?? pick(meta, ['ad_status', 'status', 'listing_status']) ?? '').toLowerCase();
  if (status && DEAD_STATUSES.some((d) => status.includes(d))) return '';

  const flagFalse = pick(raw, ['is_active', 'ad_active']) ?? pick(meta, ['is_active', 'ad_active']);
  if (flagFalse === false || flagFalse === 'false') return '';

  const flagTrue = pick(raw, ['is_deleted', 'is_removed', 'is_sold']) ?? pick(meta, ['is_deleted', 'is_removed', 'is_sold']);
  if (flagTrue === true || flagTrue === 'true') return '';

  return url;
}

export default liveYad2Url;
