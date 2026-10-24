import { LEAD_PRICE_RANGES } from '@/lib/leadPriceRanges';

/** Opening a lead's settings enables it without replacing a selected price. */
export function enableLeadPrice(value: string, tier: keyof typeof LEAD_PRICE_RANGES): string {
  return Number(value) > 0 ? value : String(LEAD_PRICE_RANGES[tier].min);
}