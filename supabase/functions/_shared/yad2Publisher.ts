/** Only explicit advertiser fields from the selected ad, never related ads/site branding. */
export function publisherImageUrl(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const image = value as Record<string, unknown>;
    return publisherImageUrl(image.url ?? image.src ?? image.imageUrl);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.replace(/&amp;/g, '&'), 'https://www.yad2.co.il');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!/(^|\.)yad2\.co\.il$/.test(url.hostname)) return null;
    if (/sprite|favicon|placeholder|yad2[-_]?logo/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function licenseNumber(value: unknown): string | null {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  return /^[1-9]\d{0,7}$/.test(text) ? text : null;
}

export function verifiedSourceLicense(meta: Record<string, any>): string | null {
  const evidence = meta.broker_license_evidence;
  if (evidence?.source !== 'source_ad' || !evidence.source_url) return null;
  try {
    const url = new URL(evidence.source_url);
    if (!/(^|\.)yad2\.co\.il$/.test(url.hostname) || !/\/item\/[a-z0-9_-]+/i.test(url.pathname)) return null;
    const number = licenseNumber(meta.broker_license_number ?? meta.broker_license);
    return number && number === licenseNumber(evidence.number) ? number : null;
  } catch { return null; }
}

export function extractYad2Publisher(ad: any, sourceUrl: string): Record<string, unknown> {
  const txt = (...values: unknown[]) => values.find(v => typeof v === 'string' && v.trim()) as string | undefined;
  const agency = ad?.agency ?? ad?.office ?? ad?.broker?.agency ?? ad?.customer?.agency ?? ad?.agencyDetails ?? {};
  const broker = ad?.broker ?? ad?.contact ?? ad?.customer ?? {};
  const office = txt(ad?.agency_name, ad?.office_name, agency.name, agency.title, ad?.merchant_name);
  const name = txt(ad?.broker_name, ad?.contact_name, broker.name, broker.fullName);
  const number = licenseNumber(ad?.broker_license_number ?? ad?.broker_license ?? broker.licenseNumber ?? broker.license_number ?? broker.brokerLicenseNumber);
  const logo = [ad?.office_logo_url, ad?.agency_logo_url, ad?.agencyLogo, agency.logo, agency.logoUrl, agency.image, broker.logo, broker.logoUrl, ad?.metaData?.agencyLogo].map(publisherImageUrl).find(Boolean);
  const isBroker = !!office || !!number || ad?.publisher_kind === 'broker' || ad?.additionalDetails?.isAssetExclusive === true || ad?.attributes?.isAssetExclusive === true;
  return {
    ...(name ? { broker_name: name.trim() } : {}),
    ...(office ? { office_name: office.trim() } : {}),
    ...(isBroker ? { publisher_kind: 'broker' } : {}),
    ...(logo ? { office_logo_url: logo, office_logo_source_url: logo, office_logo_evidence: { source: 'source_ad', source_url: sourceUrl } } : {}),
    ...(number ? { broker_license_number: number, broker_license_evidence: { source: 'source_ad', source_url: sourceUrl, number } } : {}),
  };
}

/** DOM fallback is deliberately limited to the current advertiser's section. */
export function extractYad2PublisherHtml($: any, sourceUrl: string): Record<string, unknown> {
  const section = $('[data-testid*="agency"], [data-testid*="broker"], [class*="agencyDetails"], [class*="brokerDetails"], [class*="contactDetails"], [class*="AgencyDetails"], [class*="BrokerDetails"]').filter((_: number, el: any) => !$(el).closest('[class*="related"], [class*="recommend"], [data-testid*="related"]').length).first();
  const result: Record<string, unknown> = {};
  if (!section.length) return result;
  const text = section.text().replace(/\s+/g, ' ');
  const number = licenseNumber(text.match(/(?:מספר\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*(\d{1,8})(?!\d)/)?.[1]);
  const logoElement = section.find('img').filter((_: number, el: any) => /logo|לוגו|agency|office|משרד/i.test([$(el).attr('alt'), $(el).attr('class'), $(el).attr('data-testid')].join(' '))).first();
  const logo = publisherImageUrl(logoElement.attr('src') ?? logoElement.attr('data-src'));
  if (logo) Object.assign(result, { office_logo_url: logo, office_logo_source_url: logo, office_logo_evidence: { source: 'source_ad', source_url: sourceUrl } });
  if (number) Object.assign(result, { broker_license_number: number, broker_license_evidence: { source: 'source_ad', source_url: sourceUrl, number }, publisher_kind: 'broker' });
  if (/נכסים נוספים של המשרד|בלעדיות/.test(text)) result.publisher_kind = 'broker';
  return result;
}