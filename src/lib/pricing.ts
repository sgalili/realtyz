/**
 * Realtyz — מודל תמחור לפי חבילות (Single source of truth).
 *
 * החיוב הוא מחיר חבילה חודשי קבוע — לא לפי איש קשר ולא לפי הודעות.
 * שיטת החישוב: מחיר חבילה חודשי + ארנק קרדיטים לשירותים בצריכה בפועל
 * (SMS, הודעות WhatsApp בתשלום, IVR ושיחות AI קוליות).
 */

/** מסלול חינם נצחי (Freemium) — ללא הגבלת זמן, ללא כרטיס אשראי. */
export const FREE_CONTACTS = 10;
export const FREE_PROPERTIES = 5;

export interface PricingPackage {
  id: 'free' | 'basic' | 'pro' | 'agency';
  name: string;
  monthlyPrice: number;
  tagline: string;
  contacts: number;
  properties: number;
  seats: number;
  features: string[];
  highlight?: boolean;
}

/** החבילות הרשמיות. מחיר חודשי קבוע, בלי עלויות נסתרות. */
export const PACKAGES: PricingPackage[] = [
  {
    id: 'free',
    name: 'חינם',
    monthlyPrice: 0,
    tagline: 'להתחלה, בלי כרטיס אשראי',
    contacts: FREE_CONTACTS,
    properties: FREE_PROPERTIES,
    seats: 1,
    features: ['CRM מתעניינים', 'תיבת שיחות אחת', 'יצירת פוסט אחד ליום'],
  },
  {
    id: 'basic',
    name: 'בסיס',
    monthlyPrice: 145,
    tagline: 'למתווך עצמאי',
    contacts: 250,
    properties: 25,
    seats: 1,
    features: [
      'CRM מתעניינים מלא',
      'תיבת דואר אומני-צ׳אנל',
      'ניהול נכסים ומלאי חי',
      'יצירת פוסטים ופרסום לרשתות',
    ],
  },
  {
    id: 'pro',
    name: 'מקצועי',
    monthlyPrice: 495,
    tagline: 'המסלול הפופולרי',
    contacts: 2_000,
    properties: Infinity,
    seats: 5,
    features: [
      'כל מה שבבסיס',
      'טייס אוטומטי AI לתשובות ומעקבים',
      'תזמון פוסטים לקבוצות ואינסטגרם',
      'סנכרון יומן ותיאום צפיות',
      'דוחות וניתוח עסקי',
    ],
    highlight: true,
  },
  {
    id: 'agency',
    name: 'סוכנות',
    monthlyPrice: 795,
    tagline: 'לצוותים וסוכנויות',
    contacts: Infinity,
    properties: Infinity,
    seats: Infinity,
    features: [
      'כל מה שבמקצועי',
      'משתמשים וצוות ללא הגבלה',
      'הרשאות, פיקוח ויומן פעילות',
      'מיתוג לבן ופורטל לקוחות',
      'ליווי והטמעה אישיים',
    ],
  },
];

/** תיאור מגבלה בעברית (∞ → "ללא הגבלה"). */
export function limitLabel(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('he-IL') : 'ללא הגבלה';
}

/** החבילה המומלצת לפי השימוש בפועל. */
export function recommendedPackage(contacts: number, properties = 0): PricingPackage {
  return (
    PACKAGES.find((p) => contacts <= p.contacts && properties <= p.properties) ??
    PACKAGES[PACKAGES.length - 1]
  );
}
