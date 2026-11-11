import { batchListingUrls, batchPhone } from './brokerBatchImport.ts';

export const AGENCIES_URL = 'https://www.yad2.co.il/realestate/agencies';
export function agencyUrl(value: unknown, base = AGENCIES_URL): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || u.hostname !== 'www.yad2.co.il' || u.username || u.password || !/^\/realestate\/(?:agencies(?:\/|$)|agency\/\d+(?:\/|$))/.test(u.pathname)) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
export function agencyPageUrl(page: number) {
  const u = new URL(AGENCIES_URL);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.href;
}

/** Each identity and its listings are read only from its own card, not office-wide ads. */
export function parseAgencies($: any, sourceUrl: string) {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  const text = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  const add = (r: Record<string, any>) => {
    const key = `${r.source_url}:${r.publisher?.broker_license_number ?? ''}:${r.publisher?.broker_name ?? ''}`;
    if (!seen.has(key)) { seen.add(key); rows.push(r); }
  };
  const ownListings = (links: unknown[]) => batchListingUrls(links.flatMap(v => {
    const raw = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as any).url ?? (v as any).href : null;
    try { return raw ? [new URL(raw, sourceUrl).href] : []; } catch { return []; }
  }));
  const structured = (node: any, office = '') => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(v => structured(v, office)); return; }
    const officeName = text(node.office_name ?? node.agencyName ?? node.agency?.name ?? office);
    const license = text(String(node.broker_license_number ?? node.licenseNumber ?? node.license_number ?? ''));
    // Generic agency.name is never treated as a person's name.
    const name = text(node.broker_name ?? node.brokerName ?? node.fullName ?? node.full_name);
    const url = agencyUrl(node.url ?? node.href ?? node.link, sourceUrl) ?? sourceUrl;
    if (name || agencyUrl(node.url ?? node.href ?? node.link, sourceUrl)) add({
      source_url: url, owner_name: name || null,
      owner_phone: batchPhone(node.mobile ?? node.phone ?? node.phoneNumber ?? ''),
      owner_email: text(node.email) || null,
      listing_urls: ownListings(node.listings ?? node.items ?? []),
      publisher: { publisher_kind: 'broker', broker_name: name || null, office_name: officeName || text(node.name) || null,
        ...(/^[1-9]\d{3,9}$/.test(license) && name ? { broker_license_number: license } : {}) },
    });
    for (const [key, value] of Object.entries(node)) {
      if (/^(listings|items|related|recommendations|ads|feed)$/i.test(key)) continue;
      if (value && typeof value === 'object') structured(value, officeName || text(node.name));
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
    if(url) add({source_url:url,publisher:{publisher_kind:'broker',office_name:text(link.find('h2,h3').first().text() || link.text())},listing_urls:[]});
  });
  cards.each((_: number, el: any) => {
    const card = $(el);
    if (card.closest('[class*="related"], [class*="recommend"]').length) return;
    const name = text(card.find('[data-testid="broker-name"], [class*="brokerName"], [class*="BrokerName"], [class*="contactName"]').first().text());
    const office = text(card.find('[data-testid="agency-name"], [class*="agencyName"], [class*="AgencyName"], h2, h3').first().text());
    const license = card.text().match(/(?:(?:מספר|מס['׳]?)\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*([1-9]\d{3,9})(?!\d)/)?.[1];
    const url = agencyUrl(card.find('a[href*="/realestate/agencies/"],a[href*="/realestate/agency/"]').first().attr('href'), sourceUrl) ?? sourceUrl;
    if (!office && !name) return;
    add({source_url:url, owner_name:name || null, owner_phone:batchPhone(card.find('a[href^="tel:"]').first().attr('href') ?? ''),
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