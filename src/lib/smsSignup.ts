import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

export const signupNamePart = z.string().trim().min(2).max(80).regex(/^\p{L}+$/u);
export const israeliMobile = z.string().transform(value => value.replace(/[\s()+-]/g, '')).refine(value => /^05\d{8}$/.test(value) || /^9725\d{8}$/.test(value)).transform(value => value.startsWith('0') ? `972${value.slice(1)}` : value);
export const smsSignupSchema = z.object({ firstName: signupNamePart, lastName: signupNamePart, gender: z.enum(['male', 'female']), phone: israeliMobile });
export type SmsSignup = z.input<typeof smsSignupSchema>;
const KEY = 'toraff-sms-signup';
export function saveSmsSignup(value: SmsSignup) { sessionStorage.setItem(KEY, JSON.stringify(value)); }
export function readSmsSignup(): SmsSignup | null {
  try { const result = smsSignupSchema.safeParse(JSON.parse(sessionStorage.getItem(KEY) ?? 'null')); return result.success ? result.data : null; } catch { return null; }
}
export function clearSmsSignup() { sessionStorage.removeItem(KEY); }
export const signupTypes = ['property_owner', 'property_seeker', 'broker', 'developer', 'partner'] as const;
export type SmsSignupType = typeof signupTypes[number];
export const signupTypeFields: Record<SmsSignupType, readonly [string, string][]> = {
  property_owner: [['property_area', 'אזור הנכס'], ['property_type', 'סוג הנכס']],
  property_seeker: [['search_area', 'אזור חיפוש מועדף'], ['budget', 'תקציב משוער']],
  broker: [['office_name', 'שם המשרד'], ['service_area', 'אזור פעילות']],
  developer: [['company_name', 'שם החברה'], ['main_project', 'פרויקט מרכזי']],
  partner: [['marketing_channel', 'ערוץ שיווק עיקרי']],
};
export function signupDetailsValid(type: SmsSignupType, details: Record<string, string>) {
  return signupTypeFields[type].every(([key]) => z.string().trim().min(1).max(200).safeParse(details[key]).success)
    && (type !== 'property_seeker' || z.coerce.number().positive().max(1e12).safeParse(details.budget).success);
}
export async function signupRpc(name: 'complete_sms_signup' | 'complete_sms_signup_details', args: Record<string, unknown>) {
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: { ok?: boolean } | null; error: { message: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error || !data?.ok) throw new Error(error?.message ?? 'לא ניתן לשמור את פרטי ההרשמה');
}