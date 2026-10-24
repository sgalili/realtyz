export function isFeedEligible(row: { status?: string; is_published?: boolean; affiliate_enabled?: boolean }): boolean {
  return row.status !== 'discarded' && (row.is_published === true || row.affiliate_enabled === true);
}

export function publicPricing(row: Record<string, unknown>, signedIn: boolean, closingAllowed: boolean): Record<string, unknown> {
  const safe = { ...row };
  const features = row.features as { deal_closing_commission?: { value?: unknown; type?: unknown } } | undefined;
  const closing = features?.deal_closing_commission;
  const closingAmount = Number(closing?.value ?? row.affiliate_tier4_amount);
  if (closingAmount > 0) {
    safe.affiliate_tier4_amount = closingAmount;
    safe.affiliate_tier4_type = closing?.type ?? row.affiliate_tier4_type;
  }
  safe.reward_types = {
    form: Number(row.affiliate_tier1_amount) > 0,
    whatsapp: Number(row.affiliate_tier2_amount) > 0,
    phone: Number(row.affiliate_tier3_amount) > 0,
    closing: closingAmount > 0,
  };
  // Pricing nested inside feature metadata is subject to the same server gate.
  if ((!signedIn || !closingAllowed) && features && typeof features === 'object' && !Array.isArray(features)) {
    const { deal_closing_commission: _closing, ...publicFeatures } = features;
    safe.features = publicFeatures;
  }
  if (!signedIn) {
    delete safe.affiliate_tier1_amount;
    delete safe.affiliate_tier2_amount;
    delete safe.affiliate_tier3_amount;
  }
  if (!signedIn || !closingAllowed) {
    delete safe.affiliate_tier4_amount;
    delete safe.affiliate_tier4_type;
  }
  return safe;
}