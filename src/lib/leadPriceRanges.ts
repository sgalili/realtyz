/** Advertiser-set lead price ranges in ILS per lead type. */
export const LEAD_PRICE_RANGES = {
  form: { min: 40, max: 150 },
  whatsapp: { min: 50, max: 200 },
  phone: { min: 80, max: 250 },
} as const;
export type LeadPriceKey = keyof typeof LEAD_PRICE_RANGES;
/** Daily-limit slider position meaning "ללא הגבלה". */
export const DAILY_UNLIMITED = 51;
export function clampLeadPrice(key: LeadPriceKey, value: number) {
  const { min, max } = LEAD_PRICE_RANGES[key];
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
