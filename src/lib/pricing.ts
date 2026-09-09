/**
 * Realtyz — מודל תמחור לפי חבילות (Single source of truth).
 *
 * כל החבילות כוללות את כל היכולות של המערכת ללא הגבלה.
 * ההבדל בין החבילות הוא מספר אנשי הקשר המנוהלים.
 * מודל השימוש: 15 "מגעים" (touches) לכל איש קשר בחודש.
 * כל פעולה שמשתמשת ב-AI (יצירת תוכן, פרסום, תשובה אוטומטית ב-WhatsApp/SMS/
 * טלגרם/פייסבוק/תגובות) נספרת כמגע אחד. שיחת WhatsApp שלמה נספרת כמגע אחד
 * לחלון של 24 שעות. כשנגמרים הקרדיטים ניתן לטעון את הארנק בתוך המערכת ולהמשיך.
 */

/** מסלול חינם נצחי (Freemium) — ללא הגבלת זמן, ללא כרטיס אשראי. */
export const FREE_CONTACTS = 10;
export const FREE_PROPERTIES = 5;

/** מגעים (touches) לכל איש קשר בחודש. */
export const TOUCHES_PER_CONTACT = 15;

/** מספר החודשים שמשולמים בתשלום שנתי (2 חודשים מתנה). */
export const YEARLY_PAID_MONTHS = 10;

export interface PricingPackage {
  id: 'free' | 'basic' | 'pro' | 'agency';
  name: string;
  monthlyPrice: number;
  tagline: string;
  contacts: number;
  properties: number;
  features: string[];
  highlight?: boolean;
}

/** כל החבילות כוללות את אותן יכולות — ללא הגבלה. */
export const UNIVERSAL_FEATURES: string[] = [
  'כל היכולות של המערכת ללא הגבלה',
  'נכסים ומלאי חי ללא הגבלה',
  'תיבת דואר אומני-צ׳אנל (WhatsApp, SMS, פייסבוק, אינסטגרם, מייל)',
  'טייס אוטומטי AI לתשובות, מעקבים והתאמות',
  'יצירת תוכן, פרסום ותזמון לרשתות ולקבוצות',
  'סנכרון יומן, תיאום צפיות ופורטל אנשי קשר',
  'דוחות, ניתוח עסקי ויומן פעילות',
  `${TOUCHES_PER_CONTACT} מגעי AI לכל איש קשר בחודש · טעינת ארנק בכל רגע`,
];

/** החבילות הרשמיות. מחיר חודשי קבוע, בלי עלויות נסתרות. */
export const PACKAGES: PricingPackage[] = [
  {
    id: 'free',
    name: 'חינם',
    monthlyPrice: 0,
    tagline: 'להתחלה, בלי כרטיס אשראי',
    contacts: FREE_CONTACTS,
    properties: FREE_PROPERTIES,
    features: UNIVERSAL_FEATURES,
  },
  {
    id: 'basic',
    name: 'Agent',
    monthlyPrice: 145,
    tagline: 'למתווך שמתחיל בגדול',
    contacts: 250,
    properties: Infinity,
    features: UNIVERSAL_FEATURES,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 495,
    tagline: 'המסלול הפופולרי',
    contacts: 1_000,
    properties: Infinity,
    features: UNIVERSAL_FEATURES,
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Max',
    monthlyPrice: 795,
    tagline: 'לנפח פעילות גבוה',
    contacts: 5_000,
    properties: Infinity,
    features: UNIVERSAL_FEATURES,
  },
];

/** תיאור מגבלה בעברית (∞ → "ללא הגבלה"). */
export function limitLabel(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('he-IL') : 'ללא הגבלה';
}

/** מגעים חודשיים כלולים בחבילה. */
export function monthlyTouches(pkg: PricingPackage): number {
  return Number.isFinite(pkg.contacts) ? pkg.contacts * TOUCHES_PER_CONTACT : Infinity;
}

/** מחיר שנתי — משלמים 10 חודשים, מקבלים 12. */
export function yearlyPrice(monthlyPrice: number): number {
  return monthlyPrice * YEARLY_PAID_MONTHS;
}

/** החבילה המומלצת לפי השימוש בפועל. */
export function recommendedPackage(contacts: number, properties = 0): PricingPackage {
  return (
    PACKAGES.find((p) => contacts <= p.contacts && properties <= p.properties) ??
    PACKAGES[PACKAGES.length - 1]
  );
}
