/**
 * Broker recruitment outreach — ready-made Hebrew templates used when the
 * contact is tagged as a real-estate agent (preferences.lead_kind === 'broker').
 * Goal: convince the agent to join Realtyz, lead with concrete platform value
 * and offer personal onboarding support.
 *
 * Placeholders follow the QuickMessageCard convention: {{name}}, {{city}}, {{agent}}.
 */
export type BrokerOutreachTemplate = {
  id: string;
  title: string;
  channel: 'whatsapp' | 'sms';
  body: string;
};

/**
 * The exact first-touch message Udi sends personally to an agent.
 * Kept verbatim by request: only [שם] / {{name}} is replaced.
 */
export const BROKER_FIRST_OUTREACH_BODY =
  'היי {{name}}, מה שלומך?\n\n' +
  'כאן אודי ויטמן מאנגלו סכסון הרצליה רמת השרון.\n\n' +
  'אני פונה אליך באופן אישי כי אני מאוד מעריך אותך כאיש מקצוע ואת הדרך שבה אתה עובד.\n\n' +
  'בתקופה האחרונה אני שותף בפיתוח של RealtyZ, מערכת AI שנבנתה במיוחד למתווכים ולסוכנויות נדל״ן, מתוך העבודה והצרכים שאנחנו פוגשים ביום יום.\n\n' +
  'המערכת מרכזת במקום אחד לידים, לקוחות, נכסים, מעקבים, התאמות, פרסום וכלי AI שנועדו לחסוך זמן ולעזור לעבוד בצורה הרבה יותר יעילה.\n\n' +
  'חשבתי שיהיה לי מעניין במיוחד שתראה אותה ותיתן לי גם את נקודת המבט המקצועית שלך.\n\n' +
  'ההתנסות בחינם, ואם זה מסקרן אותך בוא נתאם שיחת זום קצרה להדגמה בזמן שנוח לך.';

/** Fill the agent's real name into the first-outreach message. */
export function renderBrokerFirstOutreach(name?: string | null): string {
  const clean = String(name ?? '').trim();
  return BROKER_FIRST_OUTREACH_BODY.replace(/\{\{name\}\}/g, clean || 'שלום');
}

export const BROKER_OUTREACH_TEMPLATES: BrokerOutreachTemplate[] = [
  {
    id: 'broker-first-outreach',
    title: 'הודעת פתיחה אישית',
    channel: 'whatsapp',
    body: BROKER_FIRST_OUTREACH_BODY,
  },
  {
    id: 'broker-intro',
    title: 'פתיחה למתווך',
    channel: 'whatsapp',
    body:
      'היי {{name}}, מדבר {{agent}}.\n' +
      'אני עובד עם Realtyz AI, מערכת שמנהלת במקום המתווך את המענה לאנשי קשר, את המעקב ואת הפרסום ברשתות.\n' +
      'כל פנייה מקבלת מענה מיידי בוואטסאפ, גם בערב ובסופי שבוע, וכל השיחות מרוכזות במקום אחד.\n' +
      'מעניין אותך שאראה לך את זה על הנכסים שלך? 15 דקות בזום, בלי התחייבות.',
  },
  {
    id: 'broker-value',
    title: 'יתרונות המערכת',
    channel: 'whatsapp',
    body:
      '{{name}}, שלוש דברים שמתווכים מרוויחים מ-Realtyz:\n' +
      '1. מענה אוטומטי לכל איש קשר תוך שניות, כולל סינון והבנת מה הוא מחפש.\n' +
      '2. פרסום הנכסים לקבוצות ולעמודים בלחיצה אחת, עם תגובה ראשונה שמכניסה לידים.\n' +
      '3. CRM שמזכיר בדיוק למי לחזור היום ומה נאמר בשיחה הקודמת.\n' +
      'אשמח להראות לך על נכס אמיתי שלך. מתי נוח לך לזום קצר?',
  },
  {
    id: 'broker-support',
    title: 'ליווי אישי',
    channel: 'whatsapp',
    body:
      '{{name}}, כדי שלא תישאר לבד עם עוד מערכת: אני מקים לך את החשבון, מעלה את הנכסים ואנשי הקשר מהקובץ שלך, ומכין את התשובות האוטומטיות בשם שלך.\n' +
      'אחרי זה אני זמין לליווי אישי בוואטסאפ בשבועות הראשונים.\n' +
      'רוצה שנתחיל? אשלח לך קישור להתחברות.',
  },
  {
    id: 'broker-followup',
    title: 'תזכורת עדינה',
    channel: 'whatsapp',
    body:
      'היי {{name}}, בודק אם ראית את ההודעה שלי על Realtyz.\n' +
      'גם אם עכשיו לא הזמן, אשמח לשלוח לך הדגמה קצרה של איך המערכת עונה לאנשי קשר ב{{city}} במקומך. אין שום התחייבות.',
  },
  {
    id: 'broker-sms',
    title: 'SMS קצר',
    channel: 'sms',
    body:
      '{{name}}, Realtyz AI עונה לאנשי קשר שלך בוואטסאפ 24/7 ומפרסם את הנכסים אוטומטית. ' +
      'זום של 15 דקות + ליווי אישי בהקמה. מתי נוח? {{agent}}',
  },
];

/**
 * Official Meta WhatsApp template used for the broker first-outreach blast.
 * Template ID: 1543480823752149. Variable {{1}} = broker full name.
 */
export const BROKER_WA_TEMPLATE_NAME = 'invitation_to_realestate_brokers';
export const BROKER_WA_TEMPLATE_ID = '1543480823752149';
