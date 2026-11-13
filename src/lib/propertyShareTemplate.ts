import { renderTemplateBody, templateVariableKeys, type MetaWaTemplate } from '@/hooks/useMetaWaTemplates';
import { resultLabel, type ShareWaTemplate } from '@/lib/propertyShare';
import { formatRentalPrice } from '@/lib/propertyPrice';
import type { UnifiedResult } from '@/lib/propertySearch';

export type PreparedPropertyShare = { r: UnifiedResult; url: string };

/** Use only known property-sharing schemas, never an unrelated approved message. */
export function propertyShareTemplate(templates: MetaWaTemplate[], items: PreparedPropertyShare[], name: string): { selection: ShareWaTemplate; preview: string } | null {
  if (!items.length) return null;
  const template = templates.find(t => t.status === 'APPROVED' && !t.has_header_variable && t.name === 'property_share' && /^he(?:_|$)/.test(t.language))
    ?? templates.find(t => t.status === 'APPROVED' && !t.has_header_variable && t.name === 'new_lead_property_match2' && /^he(?:_|$)/.test(t.language))
    ?? templates.find(t => t.status === 'APPROVED' && !t.has_header_variable && t.name === 'new_exclusive_listing_alert' && /^he(?:_|$)/.test(t.language) && items.length === 1);
  if (!template) return null;
  const firstName = name.trim().split(/\s+/)[0] || 'לך';
  const address = items.map(({ r }) => resultLabel(r)).join(' · ');
  const pricesAndLinks = items.map(({ r, url }) => `${formatRentalPrice(r.price, r.listing_type)} · ${url}`).join(' | ');
  const values: Record<string, string> = template.name === 'new_lead_property_match2'
    ? { '1': firstName, '2': address, '3': pricesAndLinks }
    : template.name === 'new_exclusive_listing_alert'
      ? { first_name: firstName, property_address: `${address} · ${items[0].url}`, property_price: Number(items[0].r.price || 0).toLocaleString('he-IL') + (items[0].r.listing_type === 'rent' ? ' / לחודש' : '') }
      : { first_name: firstName, property_address: address, property_price: items.map(({ r }) => formatRentalPrice(r.price, r.listing_type)).join(' · '), property_link: items.map(({ url }) => url).join(' | ') };
  const keys = templateVariableKeys(template.body_text);
  if (!keys.length || keys.some(key => !values[key])) return null;
  const body_params = keys.map(key => values[key]);
  const preview = renderTemplateBody(template.body_text, body_params);
  if (items.some(({ url }) => !preview.includes(url))) return null;
  return { selection: { name: template.name, language: template.language, body_params, body_text: template.body_text }, preview };
}