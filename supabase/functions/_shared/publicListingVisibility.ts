export function isFeedEligible(row: { status?: string; is_published?: boolean; affiliate_enabled?: boolean }): boolean {
  return row.status !== 'discarded' && (row.is_published === true || row.affiliate_enabled === true);
}

export function publicPricing(row: Record<string, unknown>, signedIn: boolean, closingAllowed: boolean): Record<string, unknown> {
  const safe = { ...row };
  safe.reward_types = {
    form: Number(row.affiliate_tier1_amount) > 0,
    whatsapp: Number(row.affiliate_tier2_amount) > 0,
    phone: Number(row.affiliate_tier3_amount) > 0,
    closing: Number(row.affiliate_tier4_amount) > 0,
  };
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