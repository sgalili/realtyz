export function isFeedEligible(row: { status?: string; is_published?: boolean; affiliate_enabled?: boolean }): boolean {
  return row.status !== 'discarded' && (row.is_published === true || row.affiliate_enabled === true);
}

/** Coarse 0-3 closing-reward color level, matching the publisher's closing slider (no amount is revealed). */
export function closingRewardLevel(value: unknown, type: unknown, dealType: unknown, price: unknown): number | null {
  const amount = Number(value);
  if (!(amount > 0)) return null;
  const rent = dealType === 'rent';
  const min = rent ? 10 : 0.2, max = rent ? 100 : 2;
  const base = Number(price);
  const percent = type === 'percent' ? amount : base > 0 ? amount / base * 100 : NaN;
  if (!Number.isFinite(percent)) return null;
  const progress = (Math.min(max, Math.max(min, percent)) - min) / (max - min);
  return Math.min(3, Math.floor(progress * 4));
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
  const level = closingRewardLevel(closingAmount, closing?.type ?? row.affiliate_tier4_type, row.deal_type, row.asking_price);
  if (level !== null) safe.closing_level = level;
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
const GENERIC_NAMES = new Set(['מתווך', 'בעל הנכס', 'מפרסם המודעה', 'בעלים', 'פרטי', 'test', 'demo', 'בדיקה', 'דמו']);

/** Public display classification, never an authorization or role grant. Unknown identities stay private. */
export function publisherDisplayKind(kind: unknown, roles: string[] = []): 'broker' | 'developer' | 'private' {
  if (['broker', 'agency', 'מתווך'].includes(String(kind))) return 'broker';
  if (['developer', 'company', 'יזם'].includes(String(kind))) return 'developer';
  if (['private', 'owner', 'property_owner', 'property_seeker', 'seller', 'buyer', 'renter', 'landlord', 'בעל הנכס'].includes(String(kind))) return 'private';
  if (roles.some(role => ['managing_broker', 'lead_agent', 'agent'].includes(role))) return 'broker';
  if (roles.includes('developer')) return 'developer';
  return 'private';
}

/** Full professional names; only private people are abbreviated. */
export function boardPublisherName(raw: unknown, kind: unknown = 'private'): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.replace(/[^\p{L}\s'"״׳-]/gu, ' ').split(/[\s-]+/).map(p => p.trim()).filter(p => p.length > 0);
  if (!parts.length || GENERIC_NAMES.has(raw.trim().toLowerCase()) || GENERIC_NAMES.has(parts[0].toLowerCase())) return null;
  const first = parts[0];
  if (first.length < 2) return null;
  if (publisherDisplayKind(kind) !== 'private') return raw.trim().replace(/\s+/g, ' ');
  return parts[1] ? `${first} ${parts[1][0]}.` : null;
}

/** Strict homepage rule: published price, at least one configured reward, real formatted publisher name. */
export function meetsBoardRules(row: Record<string, any>, publisherName: string | null): boolean {
  if (!(Number(row.asking_price) > 0)) return false;
  const closing = Number(row.features?.deal_closing_commission?.value ?? 0);
  const rewards = [row.affiliate_tier1_amount, row.affiliate_tier2_amount, row.affiliate_tier3_amount, row.affiliate_tier4_amount].some(v => Number(v) > 0) || closing > 0;
  return rewards && !!publisherName;
}

/** Demo-avatar overrides so each known demo publisher keeps one image whose gender matches the copy. */
const DEMO_PUBLISHER_AVATARS: Record<string, number> = {
  'נועם ירושלמי': 4,
  'אורן קרמונה': 2,
  'אורנה קרמונה': 2,
  'איתמר צמח': 3,
};

/**
 * Stable demo profile photo for private publishers that have no uploaded image.
 * The publisher name wins over the record id so the same person shows the same
 * photo in every workspace, and different people never share one.
 */
export function privatePublisherAvatar(seed: unknown, name?: unknown): string {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  const overridden = DEMO_PUBLISHER_AVATARS[clean];
  const s = clean || String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `https://toraff.co.il/publisher-avatars/${overridden ?? (h % 4) + 1}.jpg`;
}
