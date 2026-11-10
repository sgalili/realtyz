import { BROKER_TEMPLATE_BODY, templateBody } from '../../supabase/functions/_shared/brokerInvitationTemplate';
export { BROKER_TEMPLATE_BODY, templateBody };
export type BrokerOnboardingStatus = { stage: string; invited_at: string | null; first_login_at: string | null; pending_properties: number; published_properties: number };
export const BROKER_STAGE_LABELS: Record<string, string> = {
  not_invited: 'טרם נשלחה הזמנה רשמית', pending_otp: 'הוזמן · ממתין לכניסה עם קוד',
  pending_property_review: 'ממתין לבדיקת הנכסים ואישור פרסום', pending_inventory: 'ממתין להוספת נכסים', published: 'נכסים פורסמו',
};