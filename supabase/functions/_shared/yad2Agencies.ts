import { batchListingUrls, batchPhone } from './brokerBatchImport.ts';

export const AGENCIES_URL = 'https://www.yad2.co.il/realestate/agencies';
export const AGENCY_CITIES = [{ city: '6400', area: '18' }, { city: '5000', area: '2' }] as const;
export const AGENCY_REGISTRY_TTL_MS = 7 * 86400_000;
export function agencyListingCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/,/g, '');
  const match = raw.match(/^(\d+)$/) ?? raw.match(/(\d+)\s*(?:נכסים|נכס(?:ים)? פעיל|מודעות|properties|listings)/i);
  return match ? Number(match[1]) : null;
}
export function agencyVolumeAllowed(row: Record<string, any>, min: number, max: number) {
  const count = agencyListingCount(row.active_listing_count);
  return count === null || (count >= min && count <= max);
}
export function agencyRegistryKey(row: Record<string, any>): string | null {
  const url = agencyUrl(row.source_url);
  if (!url) return null;
  const u = new URL(url);
  const match = u.pathname.match(/^\/realestate\/(agency\/\d+|agencies\/[^/]+)/);
  return match ? `https://www.yad2.co.il/realestate/${match[1]}` : null;
}
export function recentAgencyCheck(checkedAt: string, now = Date.now()) {
  const elapsed = now - Date.parse(checkedAt);
  return elapsed >= 0 && elapsed < AGENCY_REGISTRY_TTL_MS;
}
export function agencyUrl(value: unknown, base = AGENCIES_URL): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || u.hostname !== 'www.yad2.co.il' || u.username || u.password || !/^\/realestate\/(?:agencies(?:\/|$)|agency\/\d+(?:\/|$))/.test(u.pathname)) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
export function agencyPageUrl(page: number, cityIndex = 0, next?: unknown) {
  const u = new URL(agencyUrl(next) ?? AGENCIES_URL);
  const city = AGENCY_CITIES[cityIndex] ?? AGENCY_CITIES[0];
  u.searchParams.set('city', city.city);
  u.searchParams.set('area', city.area);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.href;
}

/** Each identity and its listings are read only from its own card, not office-wide ads. */
export function parseAgencies($: any, sourceUrl: string) {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  const text = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  const add = (r: Record<string, any>) => {
    // Merge DOM/JSON representations so an unannotated office link cannot bypass its card volume.
    const same = rows.filter(v => v.source_url === r.source_url);
    for (const v of same) {
      if (r.active_listing_count != null) v.active_listing_count = r.active_listing_count;
      else if (v.active_listing_count != null) r.active_listing_count = v.active_listing_count;
    }
    const key = `${r.source_url}:${r.publisher?.broker_license_number ?? ''}:${r.publisher?.broker_name ?? ''}`;
    if (!seen.has(key)) { seen.add(key); rows.push(r); }
  };
  const ownListings = (links: unknown[]) => batchListingUrls(links.flatMap(v => {
    const raw = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as any).url ?? (v as any).href : null;
    try { return raw ? [new URL(raw, sourceUrl).href] : []; } catch { return []; }
  }));
  const structured = (node: any, office = '', parentUrl = sourceUrl, parentCount: number | null = null) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(v => structured(v, office, parentUrl, parentCount)); return; }
    const officeName = text(node.office_name ?? node.agencyName ?? node.agency?.name ?? office);
    const license = text(String(node.broker_license_number ?? node.licenseNumber ?? node.license_number ?? ''));
    // Generic agency.name is never treated as a person's name.
    const name = text(node.broker_name ?? node.brokerName ?? node.fullName ?? node.full_name);
    const url = agencyUrl(node.url ?? node.href ?? node.link, sourceUrl) ?? parentUrl;
    const count = agencyListingCount(node.activeListingCount ?? node.active_listing_count ?? node.propertiesCount ?? node.propertyCount ?? node.listingsCount ?? node.listingCount ?? node.totalProperties) ?? parentCount;
    if (name || agencyUrl(node.url ?? node.href ?? node.link, sourceUrl)) add({
      source_url: url, active_listing_count: count, owner_name: name || null,
      owner_phone: batchPhone(node.mobile ?? node.phone ?? node.phoneNumber ?? ''),
      owner_email: text(node.email) || null,
      listing_urls: ownListings(node.listings ?? node.items ?? []),
      publisher: { publisher_kind: 'broker', broker_name: name || null, office_name: officeName || text(node.name) || null,
        ...(/^[1-9]\d{3,9}$/.test(license) && name ? { broker_license_number: license } : {}) },
    });
    for (const [key, value] of Object.entries(node)) {
      if (/^(listings|items|related|recommendations|ads|feed)$/i.test(key)) continue;
      if (value && typeof value === 'object') structured(value, officeName || text(node.name), url, count);
    }
  };
  $('script#__NEXT_DATA__, script[type="application/json"]').each((_: number, el: any) => {
    try { structured(JSON.parse($(el).text())); } catch { /* not a JSON payload */ }
  });
  const selector = '[data-testid*="agency-card"], [data-testid*="broker-card"], [data-testid*="agent-card"], [class*="agencyCard"], [class*="AgencyCard"], [class*="brokerCard"], [class*="BrokerCard"], [class*="agentCard"], [class*="AgentCard"]';
  let cards = $(selector);
  // Discover office links even when Yad2 changes the card wrapper classes.
  $('a[href*="/realestate/agency/"]').each((_: number, el: any) => {
    const link=$(el); const url=agencyUrl(link.attr('href'),sourceUrl);
    if(url) add({source_url:url,active_listing_count:agencyListingCount(link.text()),publisher:{publisher_kind:'broker',office_name:text(link.find('h2,h3').first().text() || link.text())},listing_urls:[]});
  });
  cards.each((_: number, el: any) => {
    const card = $(el);
    if (card.closest('[class*="related"], [class*="recommend"]').length) return;
    const name = text(card.find('[data-testid="broker-name"], [class*="brokerName"], [class*="BrokerName"], [class*="contactName"]').first().text());
    const office = text(card.find('[data-testid="agency-name"], [class*="agencyName"], [class*="AgencyName"], h2, h3').first().text());
    const license = card.text().match(/(?:(?:מספר|מס['׳]?)\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*([1-9]\d{3,9})(?!\d)/)?.[1];
    const url = agencyUrl(card.find('a[href*="/realestate/agencies/"],a[href*="/realestate/agency/"]').first().attr('href'), sourceUrl) ?? sourceUrl;
    if (!office && !name) return;
    const count = agencyListingCount(card.attr('data-listing-count') ?? card.find('[data-testid*="property-count"], [data-testid*="listing-count"], [class*="propertyCount"], [class*="listingCount"]').first().text()) ?? agencyListingCount(card.text());
    add({source_url:url, active_listing_count:count, owner_name:name || null, owner_phone:batchPhone(card.find('a[href^="tel:"]').first().attr('href') ?? ''),
      owner_email:text(card.find('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/, '').split('?')[0]) || null,
      listing_urls: name && license ? ownListings(card.find('a[href*="/realestate/item/"]').map((_: number, a: any) => $(a).attr('href')).get()) : [],
      publisher:{publisher_kind:'broker',office_name:office || null,broker_name:name || null,...(name && license ? {broker_license_number:license} : {})}});
  });
  const challenge = /Radware Page|ShieldSquare|captcha|אנו מניחים שגולשים/.test($('title').text() + $('body').text().slice(0, 600));
  if (challenge) throw new Error('יד2 החזיר עמוד חסימה במקום ספריית משרדים');
  if (!rows.length && !/לא נמצאו|אין משרדי תיווך/.test($('main').text())) throw new Error('לא זוהו כרטיסי משרדים; ההתקדמות נשמרה לבדיקה במקום לסיים סריקה ריקה');
  const nextUrl=agencyUrl($('a[rel="next"]').attr('href'),sourceUrl);
  const results: Record<string,any>[] = rows.map(row=>({...row,directory_next_url:nextUrl}));
  return {results,next_url:nextUrl};
}