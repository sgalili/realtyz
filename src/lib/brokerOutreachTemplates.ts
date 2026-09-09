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

export const BROKER_OUTREACH_TEMPLATES: BrokerOutreachTemplate[] = [
  {
    id: 'broker-intro',
    title: 'פתיחה למתווך',
    channel: 'whatsapp',
    body:
      'היי {{name}}, מדבר {{agent}}.\n' +
      'אני עובד עם Realtyz AI, מערכת שמנהלת במקום המתווך את המענה למתעניינים, את המעקב ואת הפרסום ברשתות.\n' +
      'כל פנייה מקבלת מענה מיידי בוואטסאפ, גם בערב ובסופי שבוע, וכל השיחות מרוכזות במקום אחד.\n' +
      'מעניין אותך שאראה לך את זה על הנכסים שלך? 15 דקות בזום, בלי התחייבות.',
  },
  {
    id: 'broker-value',
    title: 'יתרונות המערכת',
    channel: 'whatsapp',
    body:
      '{{name}}, שלוש דברים שמתווכים מרוויחים מ-Realtyz:\n' +
      '1. מענה אוטומטי לכל מתעניין תוך שניות, כולל סינון והבנת מה הוא מחפש.\n' +
      '2. פרסום הנכסים לקבוצות ולעמודים בלחיצה אחת, עם תגובה ראשונה שמכניסה לידים.\n' +
      '3. CRM שמזכיר בדיוק למי לחזור היום ומה נאמר בשיחה הקודמת.\n' +
      'אשמח להראות לך על נכס אמיתי שלך. מתי נוח לך לזום קצר?',
  },
  {
    id: 'broker-support',
    title: 'ליווי אישי',
    channel: 'whatsapp',
    body:
      '{{name}}, כדי שלא תישאר לבד עם עוד מערכת: אני מקים לך את החשבון, מעלה את הנכסים והלקוחות מהקובץ שלך, ומכין את התשובות האוטומטיות בשם שלך.\n' +
      'אחרי זה אני זמין לליווי אישי בוואטסאפ בשבועות הראשונים.\n' +
      'רוצה שנתחיל? אשלח לך קישור להתחברות.',
  },
  {
    id: 'broker-followup',
    title: 'תזכורת עדינה',
    channel: 'whatsapp',
    body:
      'היי {{name}}, בודק אם ראית את ההודעה שלי על Realtyz.\n' +
      'גם אם עכשיו לא הזמן, אשמח לשלוח לך הדגמה קצרה של איך המערכת עונה למתעניינים ב{{city}} במקומך. אין שום התחייבות.',
  },
  {
    id: 'broker-sms',
    title: 'SMS קצר',
    channel: 'sms',
    body:
      '{{name}}, Realtyz AI עונה למתעניינים שלך בוואטסאפ 24/7 ומפרסם את הנכסים אוטומטית. ' +
      'זום של 15 דקות + ליווי אישי בהקמה. מתי נוח? {{agent}}',
  },
];
