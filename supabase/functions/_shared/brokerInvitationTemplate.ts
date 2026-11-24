export const BROKER_TEMPLATE_LANGUAGE = 'he';
/** Short first-contact opt-in message (no links, no demo). {propertyAddress} is filled from the broker's own Yad2 listing. */
/** Fixed first-outreach WhatsApp (Meta template body): {{1}} first name, {{2}} property address. Never edited from email screens. */
export const FIRST_CONTACT_WHATSAPP = `היי {{1}},

ראיתי את המודעה שלך ב{{2}} ורציתי לשאול בקצרה: האם יעניין אותך לקבל גישה בחינם למערכת AI מתקדמת למתווכים, שמרכזת נכסים, לידים וקמפיינים במקום אחד?

אם כן, פשוט השב ״כן״ ונמשיך מכאן.
אם לא מתאים, אפשר להשיב ״הסרה״ ולא נפנה שוב.

ריטה | TORAFF`;
export function firstContactBody(channel: 'whatsapp' | 'email' = 'email') {
  if (channel === 'whatsapp') return FIRST_CONTACT_WHATSAPP.replace('{{1}}', '{brokerName}').replace('{{2}}', '{propertyAddress}');
  return `היי {brokerName},

ראיתי את המודעה שלך ב{propertyAddress} ורציתי לשאול: האם יעניין אותך לקבל גישה בחינם למערכת AI מתקדמת למתווכים, שמרכזת נכסים, לידים וקמפיינים במקום אחד?

אם כן, הכי פשוט לשלוח לנו הודעת וואטסאפ קצרה בלחיצה על הכפתור למטה, ונמשיך משם.
אם לא מתאים, אפשר להשיב ״הסרה״ ולא נפנה שוב.

ריטה
TORAFF`;
}
export const fillFirstContact = (text: string, firstName: string, address: string | null) =>
  text.replace(/\{brokerName\}|\[שם פרטי\]/g, firstName).replace(/ ?ב\{propertyAddress\}/, address ? ` ב${address}` : '');

export function coldInvitationBody(gender: unknown, roles: readonly string[] = [], channel: 'whatsapp' | 'email' = 'whatsapp') {
  const broker = !roles.some(r => ['marketing_company','developer','property_owner','property_seeker','affiliate'].includes(r)) || roles.some(r => ['agent','lead_agent','managing_broker','junior_agent'].includes(r));
  if (broker) return `היי {brokerName},

TORAFF היא המערכת היחידה שכל מתווך חייב: מערכת הפעלה אחת לניהול כל העסק במקום אחד.

יצירת נכסים ועריכתם, שיווק ופרסום, ניהול לידים ושיחות, וואטסאפ וריטה AI, קמפיינים בפייסבוק, ייבוא מיד2, משימות, סיורים וחתימות דיגיטליות.

הנכסים שהכנו עבורך מחכים לבדיקה ולניהול במרחב האישי. פרסום ושליחת הודעות נעשים רק באישור שלך.

לחצו כאן כדי לצפות:
{authLink}

בכל שאלה אני כאן,
שי גלילי
TORAFF`;
  const audience = roles.includes('marketing_company') ? 'חברות שיווק נדל״ן' : roles.includes('developer') ? 'יזמים וחברות בנייה' : roles.includes('property_owner') ? 'מוכרים ומשכירים פרטיים' : roles.includes('property_seeker') ? 'קונים ומחפשי נכסים' : roles.includes('affiliate') && !roles.some(r => ['agent','lead_agent','managing_broker','junior_agent'].includes(r)) ? 'שותפים לשיווק נכסים' : 'מתווכים ואנשי נדל״ן';
  const invitation = gender === 'female' ? 'את מוזמנת' : gender === 'male' ? 'אתה מוזמן' : 'אפשר';
  return `היי {brokerName},

TORAFF, לוח טורף, מחבר ${audience} לרשת שותפים ולריטה AI, לשיווק נדל״ן מבוסס הצלחה, ללא דמי מנוי או התחייבות.

חסכנו את העבודה הסיזיפית: הכנו חשבון והזנו נכסים או פרויקטים לעמוד טיוטה לבדיקה. שום נכס לא מתפרסם ללא אישור. לאחר כניסה לחשבון האישי אפשר לתקן פרטים, לקבוע עמלות ותגמולים ולפרסם בחינם.

ריטה יוצרת, מפרסמת, עונה לתגובות ומייצרת לידים מסוננים 24/7.

${invitation} לצפות במרחב ההדגמה המותאם לך:
{authLink}

בכל שאלה אני כאן,
שי גלילי
לוח טורף`;
}
export const BROKER_TEMPLATE_BODY = coldInvitationBody(null);

// The requested wording has no gendered verbs; the female variant is kept separate so it can diverge when edited.
export const BROKER_TEMPLATE_BODY_FEMALE = coldInvitationBody('female');

/** Fixed, non-editable invitation wording for the recipient's saved gender (unknown uses the default). */
export const brokerTemplateFor = (gender: unknown, roles: readonly string[] = []) => coldInvitationBody(gender, roles);

/** Retire only the former warm-contact default; retain deliberate custom edits. */
export const invitationTextFor = (saved: string | undefined, gender: unknown, roles: readonly string[] = []) =>
  saved && !/בהמשך לשיחת(?:נו|ינו)|TORAFF, לוח טורף|קוד אימות במספר הכניסה/.test(saved) ? saved : brokerTemplateFor(gender, roles);

/** A broker's saved WhatsApp is never replaced by the unrelated login phone. */
export function invitationTargetPhone(whatsapp: string | null, contact: string | null, login: string | null, useWhatsApp: boolean) {
  return officialBrokerPhone(useWhatsApp ? whatsapp ?? '' : contact ?? login ?? '');
}

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