/**
 * Relevance gate for the properties list.
 * A row is only worth showing when it can actually open a useful details
 * page: it must have a location AND at least one hard fact (price / rooms /
 * size). Blank or half-scraped placeholder rows are hidden instead of
 * producing empty detail pages.
 */
export function isRelevantListing(r: any): boolean {
  if (!r) return false;
  const text = (v: unknown) => String(v ?? '').trim();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

  const hasLocation = Boolean(text(r.city) || text(r.address) || text(r.neighborhood));
  const hasFacts = Boolean(num(r.price) || num(r.rooms) || num(r.size_sqm));
  const hasIdentity = Boolean(text(r.title) || text(r.address) || r.localId || r.url);

  return hasLocation && hasFacts && hasIdentity;
}

/** Filters a list, but never returns an empty list when the input had rows. */
export function keepRelevant<T>(rows: T[]): T[] {
  const kept = rows.filter((r) => isRelevantListing(r));
  return kept.length ? kept : [];
}
