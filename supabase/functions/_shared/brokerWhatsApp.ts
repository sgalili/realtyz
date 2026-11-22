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
function primaryListing(html: string) {
  const $ = load(html);
  const main = $('main');
  const mainCount = main.length;
  if (mainCount !== 1) return { $, main, mainCount };
  main.find('nav,footer,script,template,noscript,[hidden],[aria-hidden="true"]').remove();
  main.find('*').filter((_index, element) => /related|recommend|similar/i.test(['class', 'id', 'data-testid'].map(name => $(element).attr(name) ?? '').join(' '))).remove();
  for (const element of main.find('aside').toArray()) {
    const aside = $(element);
    const contacts = aside.find('[class*="forsale-agency-contact-section"]');
    // Other sidebars are still excluded: do not borrow recommended-ad or site contacts.
    if (!contacts.length) aside.remove();
    else aside.replaceWith($('<section></section>').append(contacts.clone()));
  }
  return { $, main, mainCount };
}

export function inspectBrokerWhatsApp(html: string) {
  const { $, main, mainCount } = primaryListing(html);
  if (mainCount !== 1) return { contact: null, mainCount, candidates: 0, reason: 'primary_listing_missing' };
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
export function discoverBrokerWhatsApp(html: string): { phone: string; link: string } | null {
  return inspectBrokerWhatsApp(html).contact;
}

export function brokerWhatsAppRetry(status: number, attempt: number, retryAfter = 0): number {
  if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(status)) return 0;
  return Math.min(180, Math.max(15 * 2 ** (attempt - 1), retryAfter));
}
/** A unique visible telephone action in the saved primary listing is a suggestion, not a login update. */
export function discoverBrokerTelephone(html: string): string | null {
  const { $, main, mainCount } = primaryListing(html);
  if (mainCount !== 1) return null;
  const phones=new Set<string>();
  for(const element of main.find('a[href^="tel:"]').toArray()) {
    const phone=normalizeBrokerWhatsApp(($(element).attr('href')??'').slice(4));
    if(phone)phones.add(phone);
  }
  return phones.size===1?[...phones][0]:null;
}
