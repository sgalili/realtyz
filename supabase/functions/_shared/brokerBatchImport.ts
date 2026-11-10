export const BATCH_NO_EMAIL_DOMAIN = 'no-email.toraff.invalid';

export function batchPhone(v: string): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`;
  return /^9725\d{8}$/.test(d) ? d : null;
}

/** Keeps only exact Yad2 ad links, deduplicated, max 10 per broker. */
export function batchListingUrls(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const x = new URL(u.trim());
      const id = x.pathname.match(/\/realestate\/item\/(?:[a-z0-9-]+\/)?([a-z0-9_-]+)\/?$/i)?.[1];
      if (x.protocol === 'https:' && /(^|\.)yad2\.co\.il$/i.test(x.hostname) && id) out.add(`https://www.yad2.co.il/realestate/item/${id.toLowerCase()}`);
    } catch { /* skip */ }
  }
  return [...out].slice(0, 10);
}

export function normalizeBatchBroker(b: { full_name: string; phone: string; email?: string | null; license_number: string; office_name?: string | null; listing_urls: string[] }) {
  return { full_name: b.full_name.trim(), phone: batchPhone(b.phone), email: b.email?.trim().toLowerCase() || null, license_number: b.license_number, office_name: b.office_name?.trim() || null, urls: batchListingUrls(b.listing_urls) };
}

/** Accepts a Bright Data style JSON array (various key spellings) and returns importable brokers. */
export function parseBrokerBatch(text: string) {
  const raw = JSON.parse(text);
  const rows: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.brokers) ? raw.brokers : [];
  return rows.map(r => ({
    full_name: String(r.full_name ?? r.broker_name ?? r.name ?? '').trim(),
    phone: String(r.phone ?? r.mobile ?? r.phone_number ?? ''),
    email: r.email ? String(r.email) : null,
    license_number: String(r.license_number ?? r.broker_license ?? r.license ?? '').replace(/\D/g, ''),
    office_name: r.office_name ?? r.agency_name ?? r.agency ?? null,
    listing_urls: (r.listing_urls ?? r.listings ?? r.urls ?? []).map((x: any) => typeof x === 'string' ? x : x?.url).filter(Boolean),
  }));
}
