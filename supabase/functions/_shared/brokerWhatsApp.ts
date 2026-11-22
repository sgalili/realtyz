import { load } from 'npm:cheerio@1.0.0-rc.12';

/** Only explicit WhatsApp action URLs are evidence; never infer WhatsApp from a telephone. */
export function normalizeBrokerWhatsApp(value: string): string | null {
  let digits = value.trim().replace(/[\s()+.-]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `972${digits.slice(1)}`;
  return /^9725\d{8}$/.test(digits) ? digits : null;
}

export function brokerWhatsAppAction(url: string): { phone: string; link: string } | null {
  try {
    const target = new URL(url.replace(/&amp;/g, '&'));
    if (target.protocol !== 'https:' || target.username || target.password) return null;
    const value = target.hostname === 'wa.me' ? target.pathname.slice(1)
      : ['api.whatsapp.com', 'web.whatsapp.com'].includes(target.hostname) && target.pathname === '/send' ? target.searchParams.get('phone') : null;
    const phone = value ? normalizeBrokerWhatsApp(value) : null;
    return phone ? { phone, link: `https://wa.me/${phone}` } : null;
  } catch { return null; }
}

/** Keep only the observed primary agency contact section inside a sticky aside. */
function primaryListing(html: string, sourceUrl?: string) {
  const $ = load(html);
  const main = $('main');
  const mainCount = main.length;
  if (mainCount !== 1) return { $, main, mainCount, scopeError: 'primary_listing_missing' };
  if (sourceUrl) {
    let matchesSource = false;
    try {
      const source = new URL(sourceUrl);
      const token = /^\/realestate\/item\/([a-zA-Z0-9]+)$/.exec(source.pathname)?.[1];
      const scripts = $('script#__NEXT_DATA__');
      const data = scripts.length === 1 ? JSON.parse(scripts.text()) : null;
      matchesSource = source.hostname === 'www.yad2.co.il' && !!token && data?.props?.pageProps?.token === token;
    } catch { /* Missing/invalid source identity is not contact evidence. */ }
    if (!matchesSource) return { $, main: main.empty(), mainCount, scopeError: 'source_identity_mismatch' };
  }
  main.find('nav,footer,script,template,noscript,[hidden],[aria-hidden="true"]').remove();
  main.find('[style]').filter((_i, element) => /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(element).attr('style') ?? '')).remove();
  main.find('*').filter((_index, element) => /related|recommend|similar/i.test(['class', 'id', 'data-testid'].map(name => $(element).attr(name) ?? '').join(' '))).remove();
  if (sourceUrl) {
    const contacts = main.find('aside[class*="stickyContentBox"] [class*="forsaleAgencyContactSectionBox"]');
    if (contacts.length !== 1) return { $, main: main.empty(), mainCount, scopeError: 'primary_contact_scope_missing' };
    const contact = contacts.clone();
    main.empty().append(contact);
    return { $, main, mainCount, scopeError: null };
  }
  for (const element of main.find('aside').toArray()) {
    const aside = $(element);
    const contacts = aside.find('[class*="forsale-agency-contact-section"]');
    // Other sidebars are still excluded: do not borrow recommended-ad or site contacts.
    if (!contacts.length) aside.remove();
    else aside.replaceWith($('<section></section>').append(contacts.clone()));
  }
  return { $, main, mainCount, scopeError: null };
}

export function inspectBrokerWhatsApp(html: string, sourceUrl?: string) {
  const { $, main, mainCount, scopeError } = primaryListing(html, sourceUrl);
  if (scopeError) return { contact: null, mainCount, candidates: 0, reason: scopeError };
  const candidates = new Map<string, { phone: string; link: string }>();
  for (const element of main.find('a[href]').toArray()) {
    const action = brokerWhatsAppAction($(element).attr('href') ?? '');
    if (action) candidates.set(action.phone, action);
  }
  // Ambiguity must be reviewed, never choose the first number on the page.
  return { contact: candidates.size === 1 ? [...candidates.values()][0] ?? null : null, mainCount,
    candidates: candidates.size, reason: candidates.size === 1 ? 'explicit_whatsapp_action' : candidates.size > 1 ? 'ambiguous_whatsapp_actions' : 'no_explicit_whatsapp_action' };
}

/** Read rendered actions in the primary listing only. Related ads/nav/footer are never a source. */
export function discoverBrokerWhatsApp(html: string, sourceUrl?: string): { phone: string; link: string } | null {
  return inspectBrokerWhatsApp(html, sourceUrl).contact;
}

export function brokerWhatsAppRetry(status: number, attempt: number, retryAfter = 0): number {
  if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(status)) return 0;
  return Math.min(180, Math.max(15 * 2 ** (attempt - 1), retryAfter));
}
/** A unique visible telephone action in the saved primary listing is a suggestion, not a login update. */
export function discoverBrokerTelephone(html: string, sourceUrl?: string): string | null {
  const { $, main, scopeError } = primaryListing(html, sourceUrl);
  if (scopeError) return null;
  const phones=new Set<string>();
  for(const element of main.find('a[href^="tel:"]').toArray()) {
    const phone=normalizeBrokerWhatsApp(($(element).attr('href')??'').slice(4));
    if(phone)phones.add(phone);
  }
  return phones.size===1?[...phones][0]:null;
}
