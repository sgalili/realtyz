export type LeadKind = 'buyer' | 'seller' | 'renter' | 'landlord' | 'broker' | 'affiliate';

/** Empty/all-visible selection includes older unclassified leads. */
export function leadCategoryOrFilter(selected: LeadKind[], available: LeadKind[]): string | undefined {
  const active = [...new Set(selected)].filter((kind) => available.includes(kind));
  if (!active.length || available.every((kind) => active.includes(kind))) return undefined;
  return active.map((kind) => `preferences->>lead_kind.eq.${kind}`).join(',');
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