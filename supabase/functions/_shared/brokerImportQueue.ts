import { batchPhone, batchListingUrls } from './brokerBatchImport.ts';

export type DiscoveredBroker = { full_name: string; phone: string | null; email?: string; license_number: string; office_name?: string; agency_description?: string; imported_bio?: string; listing_urls: string[] };
export function validImportParameters(target: number, min: number, max: number) {
  return [target, min, max].every(Number.isInteger) && target >= 1 && target <= 100 && min >= 1 && max <= 10 && max >= min;
}
export function collectBrokers(rows: Record<string, any>[], min: number, max: number): DiscoveredBroker[] {
  const grouped = new Map<string, DiscoveredBroker>();
  for (const row of rows) {
    const p = row.publisher ?? row.raw?.publisher ?? {};
    const phone = batchPhone(row.owner_phone ?? row.raw?.owner_phone ?? '');
    const license = String(p.broker_license_number ?? '');
    const name = String(p.broker_name ?? row.owner_name ?? row.raw?.owner_name ?? '').trim();
    if (!/^[1-9]\d{3,9}$/.test(license) || !name || p.publisher_kind !== 'broker') continue;
    // Grouped by license: Yad2 usually hides the mobile, which the Super Admin completes later.
    const key = license;
    const b: DiscoveredBroker = grouped.get(key) ?? { full_name: name, phone: phone ?? null, license_number: license, office_name: p.office_name, listing_urls: [] };
    if (!b.phone && phone) b.phone = phone;
    if (!b.imported_bio && typeof p.imported_bio === 'string') b.imported_bio = p.imported_bio.trim().slice(0, 5000);
    if (!b.agency_description && typeof p.agency_description === 'string') b.agency_description = p.agency_description.trim().slice(0, 5000);
    if (!b.email && typeof row.owner_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.owner_email)) b.email = row.owner_email;
    b.listing_urls = batchListingUrls([...b.listing_urls, ...(row.listing_urls ?? []), row.source_url]); grouped.set(key, b);
  }
  return [...grouped.values()].filter(b => b.listing_urls.length >= min).map(b => ({ ...b, listing_urls: b.listing_urls.slice(0, max) }));
}
export function nextImportPoint(brokerIndex: number, listingIndex: number, listingCount: number) {
  return listingIndex + 1 >= listingCount ? { brokerIndex: brokerIndex + 1, listingIndex: 0 } : { brokerIndex, listingIndex: listingIndex + 1 };
}

export function freshImportCheckpoint() {
  return { page: 1, source: 'agencies', discoveryVersion: 3, rows: [], brokers: [], brokerIndex: 0, listingIndex: 0, phase: 'scanning', freshSearch: true };
}

export function advanceSearchPoint(c: Record<string, any>, exhausted = false) {
  // Pasted links are a closed list: never fall through to directory pagination.
  if (c.source === 'urls') { c.phase = c.brokers?.length ? 'validating' : 'completed'; delete c.rows; delete c.enrichUrls; return; }
  if (c.source === 'agencies') {
    if (!exhausted && c.page < 100) { c.page++; c.phase = 'scanning'; return; }
    c.phase = c.brokers?.length ? 'validating' : 'completed';
    delete c.rows; delete c.enrichUrls; return;
  }
  if (c.page < 20 && !exhausted) { c.page++; c.phase = 'scanning'; return; }
  if (c.deal === 'sale') { c.deal = 'rent'; c.page = 1; c.phase = 'scanning'; return; }
  c.phase = c.brokers?.length ? 'validating' : 'completed';
  delete c.rows; delete c.enrichUrls;
}

// Local daily claims are not provider rate limits. Consume exactly one queue item.
export function skipRestrictedImport(c: Record<string, any>) {
  if (c.phase === 'enriching') {
    c.enrichUrls.shift(); c.enriched = (c.enriched ?? 0) + 1;
    if (!c.enrichUrls.length) advanceSearchPoint(c);
    return { brokerFinished: false };
  }
  if (c.phase === 'scanning') { advanceSearchPoint(c); return { brokerFinished: false }; }
  if (c.phase !== 'importing') return null;
  const broker = c.brokers?.[c.brokerIndex];
  if (!broker) return null;
  const next = nextImportPoint(c.brokerIndex, c.listingIndex, broker.listing_urls.length);
  const brokerFinished = next.brokerIndex > c.brokerIndex && (c.brokerListingsDone ?? 0) > 0;
  const movedBroker = next.brokerIndex > c.brokerIndex;
  Object.assign(c, next);
  if (movedBroker) { c.phase = 'validating'; delete c.brokerId; delete c.brokerListingsDone; }
  return { brokerFinished };
}