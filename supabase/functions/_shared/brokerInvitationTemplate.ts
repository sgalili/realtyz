export const BROKER_TEMPLATE_LANGUAGE = 'he';
export const BROKER_TEMPLATE_BODY = `שלום {brokerName},
צוות TORAFF מזמין אותך להיכנס למרחב העבודה שלך באמצעות קוד אימות, לעבור על פרטי הנכסים, ולהגדיר עמלת סגירה ותמחור פניות לפני אישור הפרסום בלוח השותפים.
הנכסים אינם מתפרסמים ללא אישורך. ניתן להשלים ולתקן את הפרטים מתוך הנכסים שלי.
לכניסה מאובטחת ולקבלת קוד אימות: {authLink}
בברכה, צוות TORAFF`;

export function templateBody(text: string): string {
  const clean = text.trim();
  if (clean.length < 80 || clean.length > 1024) throw new Error('נוסח התבנית חייב להכיל 80 עד 1024 תווים');
  if ((clean.match(/\{brokerName\}/g) ?? []).length !== 1 || (clean.match(/\{authLink\}/g) ?? []).length !== 1) throw new Error('יש לשמור פעם אחת את {brokerName} ואת {authLink} בנוסח');
  const body = clean.replace('{brokerName}', '{{1}}').replace('{authLink}', '{{2}}');
  if (/[{}]/.test(body.replace('{{1}}', '').replace('{{2}}', ''))) throw new Error('משתנים נוספים אינם נתמכים בתבנית זו');
  if (body.indexOf('{{1}}') > body.indexOf('{{2}}')) throw new Error('שם המתווך חייב להופיע לפני קישור הכניסה');
  if (body.split(/\s+/).length < 25) throw new Error('יש להוסיף מלל מספק סביב משתני התבנית');
  return body;
}

export async function invitationTemplateName(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(bytes)).map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 16);
  return `toraff_broker_onboarding_${hash}`;
}

export function brokerStage(value: { first_login_at?: string | null; invited_at?: string | null; pending_properties: number; published_properties: number }): string {
  if (!value.first_login_at) return value.invited_at ? 'pending_otp' : 'not_invited';
  if (value.pending_properties > 0) return 'pending_property_review';
  return value.published_properties > 0 ? 'published' : 'pending_inventory';
}

export function officialBrokerPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  return /^9725\d{8}$/.test(digits) ? digits : null;
}