import { batchPhone, batchListingUrls } from './brokerBatchImport.ts';

export type DiscoveredBroker = { full_name: string; phone: string; license_number: string; office_name?: string; listing_urls: string[] };
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
    if (!phone || !/^[1-9]\d{3,9}$/.test(license) || !name || p.publisher_kind !== 'broker') continue;
    const key = `${phone}:${license}`;
    const b = grouped.get(key) ?? { full_name: name, phone, license_number: license, office_name: p.office_name, listing_urls: [] };
    b.listing_urls = batchListingUrls([...b.listing_urls, row.source_url]); grouped.set(key, b);
  }
  return [...grouped.values()].filter(b => b.listing_urls.length >= min).map(b => ({ ...b, listing_urls: b.listing_urls.slice(0, max) }));
}
export function nextImportPoint(brokerIndex: number, listingIndex: number, listingCount: number) {
  return listingIndex + 1 >= listingCount ? { brokerIndex: brokerIndex + 1, listingIndex: 0 } : { brokerIndex, listingIndex: listingIndex + 1 };
}