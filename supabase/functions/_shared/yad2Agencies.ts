import { batchListingUrls, batchPhone } from './brokerBatchImport.ts';

export const AGENCIES_URL = 'https://www.yad2.co.il/realestate/agencies';
/** Discovery reads the national directory only; geography is never added or inherited. */
export const AGENCY_GEO_PARAMS = ['city', 'area', 'topArea', 'neighborhood', 'region', 'street'] as const;
export const AGENCY_REGISTRY_TTL_MS = 7 * 86400_000;
export function agencyListingCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/,/g, '');
  const match = raw.match(/^(\d+)$/) ?? raw.match(/(\d+)\s*(?:נכסים|נכס(?:ים)? פעיל|מודעות|נכסים למכירה|נכסים להשכרה|properties|listings)/i);
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
export function agencyPageUrl(page: number, next?: unknown) {
  const u = new URL(agencyUrl(next) ?? AGENCIES_URL);
  for (const key of AGENCY_GEO_PARAMS) u.searchParams.delete(key);
  if (page > 1) u.searchParams.set('page', String(page)); else u.searchParams.delete('page');
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
  const selector = '[data-testid*="agency-card"], [data-testid*="agency-item"], [class*="agency-card"], [class*="agency-item"], [class*="agency_item"], [class*="agencyItem"], [class*="AgencyItem"], [class*="agency-box"], li:has(> a[href*="/realestate/agency/"]), [data-testid*="broker-card"], [data-testid*="agent-card"], [class*="agencyCard"], [class*="AgencyCard"], [class*="brokerCard"], [class*="BrokerCard"], [class*="agentCard"], [class*="AgentCard"]';
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
    const office = text(card.find('[data-testid="agency-name"], [class*="agencyName"], [class*="AgencyName"], [class*="agency-name"], [class*="agency_name"], [class*="title"], h2, h3, h4').first().text());
    const license = card.text().match(/(?:(?:מספר|מס['׳]?)\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*([1-9]\d{3,9})(?!\d)/)?.[1];
    const url = agencyUrl(card.find('a[href*="/realestate/agencies/"],a[href*="/realestate/agency/"]').first().attr('href'), sourceUrl) ?? sourceUrl;
    if (!office && !name) return;
    const count = agencyListingCount(card.attr('data-listing-count') ?? card.find('[data-testid*="property-count"], [data-testid*="listing-count"], [class*="propertyCount"], [class*="listingCount"], [class*="property-count"], [class*="assets"], [class*="count"]').first().text()) ?? agencyListingCount(card.text());
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
/** True for a single office/broker profile page (not the national directory). */
export function isAgencyProfileUrl(value: unknown): boolean {
  const url = agencyUrl(value);
  return Boolean(url && /^\/realestate\/agency\/\d+/.test(new URL(url).pathname));
}

const NON_RESIDENTIAL_RE = /(מסחרי|משרד(?:ים)?(?!\s*(?:ה)?תיווך)|חנות|חנויות|מגרש|קרקע|תעשי|מחסן|חניה למכירה|commercial|office|shop|land|industr|warehouse)/i;
const RENT_RE = /(להשכרה|השכרה|לחודש|\/rent|forrent)/i;
const SALE_RE = /(למכירה|מכירה|\/forsale)/i;

/**
 * Reads one broker/office profile page: page-level identity plus the profile's own
 * residential sale/rent listing links (related/recommended blocks excluded).
 * Final residential/live checks still happen per listing before any draft is saved.
 */
export function parseAgencyProfile($: any, sourceUrl: string, maxListings = 10) {
  const text = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  const challenge = /Radware Page|ShieldSquare|captcha|אנו מניחים שגולשים/.test($('title').text() + $('body').text().slice(0, 600));
  if (challenge) throw new Error('יד2 החזיר עמוד חסימה במקום עמוד המתווך');
  let name = '', office = '', license = '', phone: string | null = null, email = '';
  let bio = '';
  const visit = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { node.forEach(v => visit(v, depth + 1)); return; }
    const lic = text(String(node.broker_license_number ?? node.licenseNumber ?? node.license_number ?? node.brokerLicense ?? ''));
    const nm = text(node.broker_name ?? node.brokerName ?? node.fullName ?? node.full_name ?? node.agentName);
    if (!license && /^[1-9]\d{3,9}$/.test(lic)) { license = lic; if (nm) name = nm; }
    if (!name && nm) name = nm;
    if (!bio && nm && lic) bio = text(node.brokerBio ?? node.agentBio ?? node.biography).slice(0, 5000);
    if (!office) office = text(node.agencyName ?? node.office_name ?? node.officeName ?? node.agency?.name);
    if (!phone) phone = batchPhone(node.mobile ?? node.brokerPhone ?? node.phone ?? '') ?? null;
    if (!email && typeof node.email === 'string' && /@/.test(node.email)) email = text(node.email);
    for (const [k, v] of Object.entries(node)) {
      if (/^(related|recommendations|similar|ads|feed)$/i.test(k)) continue;
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  $('script#__NEXT_DATA__, script[type="application/json"]').each((_: number, el: any) => { try { visit(JSON.parse($(el).text())); } catch { /* not JSON */ } });
  const header = $('[data-testid*="agency"], [data-testid*="broker"], [class*="agencyDetails"], [class*="AgencyDetails"], [class*="brokerDetails"], [class*="BrokerDetails"], [class*="agencyHeader"], [class*="AgencyHeader"], header, h1').filter((_: number, el: any) => !$(el).closest('[class*="related"], [class*="recommend"]').length);
  if (!name) name = text(header.find('[data-testid="broker-name"], [class*="brokerName"], [class*="BrokerName"], [class*="contactName"], [class*="agentName"]').first().text());
  if (!office) office = text($('[data-testid="agency-name"], [class*="agencyName"], [class*="AgencyName"]').first().text() || $('h1').first().text());
  if (!license) license = $('body').text().match(/(?:(?:מספר|מס['׳]?)\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*([1-9]\d{3,9})(?!\d)/)?.[1] ?? '';
  if (!phone) phone = batchPhone($('a[href^="tel:"]').first().attr('href') ?? '') ?? null;
  if (!email) email = text($('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/, '').split('?')[0]);
  if (!bio) bio = text($('[data-testid="broker-bio"], [data-testid="agent-bio"], [class*="brokerBio"], [class*="BrokerBio"]').filter((_: number, el: any) => !$(el).closest('[class*="related"], [class*="recommend"]').length).first().text()).slice(0, 5000);
  const deal = /forrent|\/rent/i.test(sourceUrl) ? 'rent' : /forsale/i.test(sourceUrl) ? 'sale' : null;
  const links: string[] = [];
  $('a[href*="/realestate/item/"]').each((_: number, el: any) => {
    const a = $(el);
    if (a.closest('[class*="related"], [class*="recommend"], [class*="similar"]').length) return;
    const card = a.closest('[data-testid*="item"], [class*="feed-item"], [class*="feedItem"], [class*="item-layout"], li, article');
    const blob = text(card.length ? card.text() : a.text());
    if (NON_RESIDENTIAL_RE.test(blob)) return;
    if (deal === 'sale' && RENT_RE.test(blob) && !SALE_RE.test(blob)) return;
    if (deal === 'rent' && SALE_RE.test(blob) && !RENT_RE.test(blob)) return;
    try { links.push(new URL(a.attr('href'), sourceUrl).href); } catch { /* skip */ }
  });
  // Keep a few spare candidates: some may fail the per-listing live/residential check.
  const listingUrls = batchListingUrls(links).slice(0, Math.max(1, maxListings) * 2);
  const validLicense = /^[1-9]\d{3,9}$/.test(license) && Boolean(name);
  if (!name && !office) throw new Error('לא זוהו פרטי מתווך בעמוד; ההתקדמות נשמרה לבדיקה');
  return { results: [{
    source_url: agencyUrl(sourceUrl), active_listing_count: listingUrls.length, owner_name: name || null,
    owner_phone: phone, owner_email: email || null, listing_urls: validLicense ? listingUrls : [],
    publisher: { publisher_kind: 'broker', broker_name: name || null, office_name: office || null, ...(validLicense ? { broker_license_number: license, imported_bio: bio || null } : {}) },
    directory_next_url: null,
  }], next_url: null };
}
