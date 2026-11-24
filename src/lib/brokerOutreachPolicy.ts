export const BROKER_CALL_DELAY_MS = 60_000;
export const BROKER_DEMO_MAX_SECONDS = 90;

export { outreachReply } from '../../supabase/functions/_shared/brokerOutreachReply';

export function brokerVoiceIntro(firstName: string, gender: string | null, draftCount: number, propertyContext = ''): string {
  const greeting = firstName.trim().split(/\s+/)[0] || 'שלום';
  const invitation = gender === 'male' ? 'אתה מוזמן' : gender === 'female' ? 'את מוזמנת' : 'אפשר';
  const inventory = draftCount > 0 ? `בחשבון שלך שמורות טיוטות נכסים${propertyContext ? `, ובהן נכס ב${propertyContext}` : ''}` : 'אפשר להכיר את המערכת בחשבון שלך';
  return `שלום ${greeting}, אני ריטה, סוכנת ה-AI של TORAFF. המערכת מרכזת נכסים, פניות, משימות, חתימות וקמפיינים במקום אחד. ${inventory}. ${invitation} להיכנס עם מספר הטלפון שלך וקוד אימות. אפשר לכתוב לי ישירות בוואטסאפ הרשמי לתמיכה ולבקשות. נכסים לא מתפרסמים ללא אישור שלך.`;
}

export function shortBrokerDemoCall(firstName: string, gender: string | null) {
  return {
    firstMessage: `שלום ${firstName.trim().split(/\s+/)[0] || ''}, אני ריטה, העוזרת של TORAFF. זו שיחת הדגמה קצרה עם בינה מלאכותית, רק כדי לתת טעימה מהשיחה איתי. זה לא ייקח הרבה זמן. מה דעתך על המערכת עד עכשיו?`,
    prompt: `את ריטה, עוזרת דיגיטלית של TORAFF. זו שיחת הדגמה בלבד, עד ${BROKER_DEMO_MAX_SECONDS} שניות. דברי בעברית קצרה וטבעית, משפט אחד בכל תור. מגדר שמור: ${gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : 'לא ידוע, השתמשי בניסוח ניטרלי'}; לעולם אל תנחשי מגדר מהשם או מהקול. שאלי מה דעתם עד עכשיו, ואז לכל היותר שתי שאלות: באילו ערים עובד המשרד, ובאילו סוגי נכסים מתמקד המשרד. סיימי בתודה ובהזמנה לכתוב לריטה בוואטסאפ. אם מבקשים להפסיק, סיימי מיד. אל תעדכני פרופיל, אל תשלחי הודעות ואל תפעילי כלים; תשובות הן הצעות בלבד לאישור המתווך. אל תמציאי מידע. אין להשתמש במקפים כפולים.`,
    maxDurationSeconds: BROKER_DEMO_MAX_SECONDS,
  };
}

export function canOverrideDemoCall(status: string, dueAt: string | null, now = Date.now()) {
  return status === 'pending' && dueAt !== null && now < Date.parse(dueAt);
}