/**
 * Realtyz — מודל "מגעי קרדיט" (Touch Credits / T.C.) ותעריפי הפצה פרטית.
 * Single source of truth למסך "חבילות וקרדיטים" ולעמוד הנחיתה.
 */

/** מגעים חינם לכל איש קשר בחודש — כלולים בחבילה. */
export const FREE_TC_PER_CONTACT = 15;

/** עלות מגע נוסף מעל המכסה — לכל איש קשר (לא לפי נפח מצטבר). */
export const EXTRA_TC_PRICE_PER_CONTACT = 0.05;

export type ChannelKey = 'sms' | 'whatsapp' | 'voice' | 'ivr' | 'email';

export interface ChannelRate {
  key: ChannelKey;
  label: string;
  /** תעריף הפצה פרטית (ללא AI) ב-₪. */
  price: number;
  /** יחידת חיוב. */
  unit: string;
  /** service_type values in usage_logs that map to this channel. */
  serviceTypes: string[];
}

export const CHANNEL_RATES: ChannelRate[] = [
  { key: 'sms', label: 'SMS', price: 0.01, unit: 'להודעה', serviceTypes: ['sms'] },
  {
    key: 'whatsapp',
    label: 'WhatsApp (חלון 24 שעות)',
    price: 0.2,
    unit: 'לחלון שיחה',
    serviceTypes: ['whatsapp_message', 'whatsapp'],
  },
  { key: 'voice', label: 'שיחת AI קולית', price: 1, unit: 'לדקה', serviceTypes: ['voice_minutes', 'voice'] },
  { key: 'ivr', label: 'AI IVR', price: 0.2, unit: 'לשיחה', serviceTypes: ['ivr', 'ivr_call'] },
  { key: 'email', label: 'אימייל', price: 0.01, unit: 'להודעה', serviceTypes: ['email'] },
];

/** סך המגעים הכלולים לפי מספר אנשי הקשר. */
export function includedTc(contacts: number): number {
  return Math.max(0, Math.round(contacts)) * FREE_TC_PER_CONTACT;
}

/** תמחור מגעים בחריגה — לפי אנשי קשר שחרגו, לא לפי נפח. */
export function extraTcCost(contactsOverQuota: number): number {
  return Math.max(0, contactsOverQuota) * EXTRA_TC_PRICE_PER_CONTACT;
}
