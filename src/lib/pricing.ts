/**
 * Realtyz — מודל תמחור לפי איש קשר (Single source of truth).
 *
 * עלות ישירה משוערת לאיש קשר פעיל לחודש (Supabase + LLM + מטמון): 0.30–0.50 ₪.
 * מחיר לקוח: 4.5 ₪ לאיש קשר לחודש → רווחיות של ~1,000% (פי 10 מהעלות).
 *
 * הכל כלול ללא הגבלה, למעט IVR ושיחות AI קוליות שמתומחרים לפי צריכה.
 */

/** מחיר לאיש קשר לחודש (₪, ללא מע"מ). */
export const PRICE_PER_CONTACT = 4.5;

/** עלות ישירה משוערת לאיש קשר לחודש (₪) — לשקיפות פנימית בלבד. */
export const DIRECT_COST_PER_CONTACT = 0.45;

/** מסלול חינם נצחי (Freemium) — ללא הגבלת זמן, ללא כרטיס אשראי. */
export const FREE_CONTACTS = 10;
export const FREE_PROPERTIES = 5;

/** הנחות כמות — שקופות לחלוטין, בלי אותיות קטנות. */
export const VOLUME_DISCOUNTS = [
  { from: 5_000, rate: 0.2 },
  { from: 2_000, rate: 0.15 },
  { from: 500, rate: 0.1 },
] as const;

export function volumeDiscountRate(contacts: number): number {
  return VOLUME_DISCOUNTS.find((d) => contacts >= d.from)?.rate ?? 0;
}

export interface PricingQuote {
  contacts: number;
  billableContacts: number;
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
  const list = billable * PRICE_PER_CONTACT;
  const rate = volumeDiscountRate(c);
  const monthly = Math.round(list * (1 - rate));
  return {
    contacts: c,
    billableContacts: billable,
    listPrice: Math.round(list),
    discountRate: rate,
    monthlyPrice: monthly,
    yearlyPrice: monthly * 12,
    isFree: billable === 0,
  };
}
