/**
 * Realtyz — מודל תמחור מדורג לפי איש קשר (Single source of truth).
 *
 * מדרגות (התעריף נקבע לפי סך אנשי הקשר, וחל על כולם):
 *   עד 1,000 אנשי קשר      → 2.5 ₪ לאיש קשר לחודש
 *   1,001 עד 5,000          → 2.0 ₪ לאיש קשר לחודש
 *   מעל 5,000               → 1.5 ₪ לאיש קשר לחודש
 *
 * הכל כלול ללא הגבלה, למעט IVR ושיחות AI קוליות שמתומחרים לפי צריכה בפועל.
 * בלי עלויות נסתרות. מסלול חינם ללא כרטיס אשראי.
 */

/** מדרגות תמחור — שקופות לחלוטין. */
export const PRICING_TIERS = [
  { upTo: 1_000, rate: 2.5, label: 'עד 1,000 אנשי קשר' },
  { upTo: 5_000, rate: 2.0, label: '1,001 - 5,000 אנשי קשר' },
  { upTo: Infinity, rate: 1.5, label: 'מעל 5,000 אנשי קשר' },
] as const;

/** תעריף הבסיס (המדרגה הראשונה). */
export const PRICE_PER_CONTACT = 2.5;

/** עלות ישירה משוערת לאיש קשר לחודש (₪) — לשקיפות פנימית בלבד. */
export const DIRECT_COST_PER_CONTACT = 0.22;

/** מסלול חינם נצחי (Freemium) — ללא הגבלת זמן, ללא כרטיס אשראי. */
export const FREE_CONTACTS = 10;
export const FREE_PROPERTIES = 5;

/** התעריף לאיש קשר לפי סך אנשי הקשר. */
export function ratePerContact(contacts: number): number {
  return PRICING_TIERS.find((t) => contacts <= t.upTo)?.rate ?? 1.5;
}

export function tierIndexFor(contacts: number): number {
  const i = PRICING_TIERS.findIndex((t) => contacts <= t.upTo);
  return i === -1 ? PRICING_TIERS.length - 1 : i;
}

export interface PricingQuote {
  contacts: number;
  billableContacts: number;
  ratePerContact: number;
  tierIndex: number;
  tierLabel: string;
  listPrice: number;
  discountRate: number;
  monthlyPrice: number;
  yearlyPrice: number;
  isFree: boolean;
}

/** חישוב עלות חודשית שקופה לפי כמות אנשי קשר. */
export function quoteForContacts(contacts: number): PricingQuote {
  const c = Math.max(0, Math.floor(contacts));
  const billable = Math.max(0, c - FREE_CONTACTS);
  const rate = ratePerContact(c);
  const tierIndex = tierIndexFor(c);
  const list = billable * PRICE_PER_CONTACT;
  const monthly = Math.round(billable * rate);
  return {
    contacts: c,
    billableContacts: billable,
    ratePerContact: rate,
    tierIndex,
    tierLabel: PRICING_TIERS[tierIndex].label,
    listPrice: Math.round(list),
    discountRate: list > 0 ? 1 - monthly / list : 0,
    monthlyPrice: monthly,
    yearlyPrice: monthly * 12,
    isFree: billable === 0,
  };
}
