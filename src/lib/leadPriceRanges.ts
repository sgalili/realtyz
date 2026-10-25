/** Advertiser-set lead price ranges in ILS per lead type. */
export const LEAD_PRICE_RANGES = {
  form: { min: 40, max: 150 },
  whatsapp: { min: 50, max: 200 },
  phone: { min: 80, max: 250 },
} as const;
export type LeadPriceKey = keyof typeof LEAD_PRICE_RANGES;
/** Daily-limit slider position meaning "ללא הגבלה". */
export const DAILY_UNLIMITED = 51;
/** Color level 0-3 of a lead price inside its range; drives the shared closing-tone gradient. */
export function leadPriceLevel(key: LeadPriceKey, value: number) {
  const { min, max } = LEAD_PRICE_RANGES[key];
  const p = (Math.min(max, Math.max(min, Number(value) || min)) - min) / (max - min);
  return Math.min(3, Math.floor(p * 4));
}
export function clampLeadPrice(key: LeadPriceKey, value: number) {
  const { min, max } = LEAD_PRICE_RANGES[key];
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/** Closing-commission color levels, cold → hot, matching the --closing-* tokens. */
export const CLOSING_LEVELS = ['low', 'medium', 'high', 'max'] as const;

/** Class form of a closing-commission level color (see .closing-level-* in index.css). */
export function closingLevelClass(level: number | null | undefined) {
  if (level == null) return undefined;
  return `closing-level-${Math.min(3, Math.max(0, Math.trunc(level)))}`;
}

/** Inline color of a closing-commission level; undefined leaves the current text color. */
export function closingLevelColor(level: number | null | undefined) {
  if (level == null) return undefined;
  const name = CLOSING_LEVELS[Math.min(3, Math.max(0, Math.trunc(level)))] ?? CLOSING_LEVELS[0];
  return `hsl(var(--closing-${name}))`;
}

/**
 * Client mirror of closingRewardLevel in supabase/functions/_shared/publicListingVisibility.ts:
 * the closing fee's position (0-3) between its deal-type bounds. The trophy keeps this
 * cold→hot color even when the amount itself stays visible to licensed brokers only.
 */
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
