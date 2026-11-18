export const BROKER_TEMPLATE_LANGUAGE = 'he';
export const BROKER_TEMPLATE_BODY = `היי {brokerName},

בהמשך לשיחתינו, אשמח לשיחת המשך לאחר התרשמותך מהפלטפורמה שלנו לשיווק נדל"ן.

חסכנו לכם את העבודה, הקמנו עבורכם חשבון והזנו דוגמא של פרויקטים של חברת...

הנכסים לא יתפרסמו בלי אישורכם. לאחר הכניסה אפשר לעבור עליהם, לתקן פרטים, לקבוע עמלות ולפרסם בלוח השותפים של המדינה בחינם לגמרי.

בטוראף הכל חינם ומבוסס הצלחה: אין דמי מנוי ואין התחייבות. כל אדם מוזמן להצטרף לרשת השותפים ולפרסם נכסים של אחרים תמורת עמלות, וריטה AI יוצרת, מפרסמת, עונה לתגובות ומייצרת לידים מסוננים 24/7.

לצפייה בחשבון ההדגמה המותאם לך, ללא צורך בהרשמה או קוד אימות:
{authLink}

בכל שאלה אני כאן,
שי גלילי
לוח טוראף
0546811841`;

// The requested wording has no gendered verbs; the female variant is kept separate so it can diverge when edited.
export const BROKER_TEMPLATE_BODY_FEMALE = BROKER_TEMPLATE_BODY;

/** Fixed, non-editable invitation wording for the recipient's saved gender (unknown uses the default). */
export const brokerTemplateFor = (gender: unknown) => gender === 'female' ? BROKER_TEMPLATE_BODY_FEMALE : BROKER_TEMPLATE_BODY;

/** Converts editable text to Meta body. {brokerName} once; {authLink} optional (link-less wording is the default). */
export function templateBody(text: string): string {
  const clean = text.trim();
  if (clean.length < 80 || clean.length > 1024) throw new Error('נוסח התבנית חייב להכיל 80 עד 1024 תווים');
  const links = (clean.match(/\{authLink\}/g) ?? []).length;
  if ((clean.match(/\{brokerName\}/g) ?? []).length !== 1 || links > 1) throw new Error('יש לשמור פעם אחת את {brokerName}; {authLink} רשות, פעם אחת לכל היותר');
  const body = clean.replace('{brokerName}', '{{1}}').replace('{authLink}', '{{2}}');
  if (/[{}]/.test(body.replace('{{1}}', '').replace('{{2}}', ''))) throw new Error('משתנים נוספים אינם נתמכים בתבנית זו');
  if (links && body.indexOf('{{1}}') > body.indexOf('{{2}}')) throw new Error('שם המתווך חייב להופיע לפני קישור הכניסה');
  if (body.split(/\s+/).length < 25) throw new Error('יש להוסיף מלל מספק סביב משתני התבנית');
  return body;
}

export const templateHasLink = (body: string) => body.includes('{{2}}');

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