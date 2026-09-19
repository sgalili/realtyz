export type AffiliatePlanSlug = 'free' | 'partner_100' | 'partner_1000' | 'partner_2000';

export type AffiliatePlan = {
  slug: AffiliatePlanSlug;
  name: string;
  monthlyPrice: number;
  contacts: number;
  highlight?: boolean;
};

export const AFFILIATE_PLANS: AffiliatePlan[] = [
  { slug: 'free', name: 'חינם', monthlyPrice: 0, contacts: 10 },
  { slug: 'partner_100', name: '100', monthlyPrice: 49, contacts: 100 },
  { slug: 'partner_1000', name: '1,000', monthlyPrice: 99, contacts: 1_000, highlight: true },
  { slug: 'partner_2000', name: '2,000', monthlyPrice: 149, contacts: 2_000 },
];

export const REALTYZ_COMMISSION_RATE = 0.2;
export const PARTNER_NET_RATE = 0.8;

export function affiliateAnnualPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

export function partnerNetReward(gross: number) {
  return Math.round(Math.max(0, gross) * PARTNER_NET_RATE * 100) / 100;
}

export function realtyzCommission(gross: number) {
  return Math.round(Math.max(0, gross) * REALTYZ_COMMISSION_RATE * 100) / 100;
}
