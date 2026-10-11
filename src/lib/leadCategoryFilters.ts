export type LeadKind = 'buyer' | 'seller' | 'renter' | 'landlord' | 'broker' | 'affiliate';

export const LEAD_KINDS: LeadKind[] = ['buyer', 'seller', 'renter', 'landlord', 'broker', 'affiliate'];

/**
 * Filters on the server-resolved `leads.lead_category` (generated from the explicit
 * lead_kind, then interest_tag, then deal_type) so every lead belongs to one category.
 * No selection means unrestricted; any selection matches only the chosen categories (OR).
 */
export function leadCategoryOrFilter(selected: LeadKind[], available: LeadKind[]): string | undefined {
  const active = [...new Set(selected)].filter((kind) => available.includes(kind));
  if (!active.length) return undefined;
  return `lead_category.in.(${active.join(',')})`;
}

/** Client fallback mirroring the server column for rows fetched before it existed. */
export function resolveLeadKind(lead: { lead_category?: string | null; preferences?: any } | null | undefined): LeadKind | null {
  const value = String(lead?.lead_category ?? lead?.preferences?.lead_kind ?? '');
  return (LEAD_KINDS as string[]).includes(value) ? (value as LeadKind) : null;
}

export function visibleLeadKinds(options: {
  ownerOnly: boolean;
  developer: boolean;
  broker: boolean;
  affiliateConsented: boolean;
}): LeadKind[] {
  const kinds: LeadKind[] = options.ownerOnly ? ['buyer', 'renter']
    : options.developer ? ['buyer', 'broker']
    : ['buyer', 'seller', 'renter', 'landlord', 'broker'];
  const visible = options.broker ? kinds.filter((kind) => kind !== 'broker') : kinds;
  return options.affiliateConsented ? [...visible, 'affiliate'] : visible;
}
