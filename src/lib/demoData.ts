// ── High-density demo mock data for Kalpiz AI ──

import voter01 from '@/assets/demo-headshots/voter-01.jpg';
import voter02 from '@/assets/demo-headshots/voter-02.jpg';
import voter03 from '@/assets/demo-headshots/voter-03.jpg';
import voter04 from '@/assets/demo-headshots/voter-04.jpg';
import voter05 from '@/assets/demo-headshots/voter-05.jpg';
import voter06 from '@/assets/demo-headshots/voter-06.jpg';
import voter07 from '@/assets/demo-headshots/voter-07.jpg';
import voter08 from '@/assets/demo-headshots/voter-08.jpg';
import voter09 from '@/assets/demo-headshots/voter-09.jpg';
import voter10 from '@/assets/demo-headshots/voter-10.jpg';
import voter11 from '@/assets/demo-headshots/voter-11.jpg';
import voter12 from '@/assets/demo-headshots/voter-12.jpg';
import voter13 from '@/assets/demo-headshots/voter-13.jpg';
import voter14 from '@/assets/demo-headshots/voter-14.jpg';
import voter15 from '@/assets/demo-headshots/voter-15.jpg';
import voter16 from '@/assets/demo-headshots/voter-16.jpg';
import voter17 from '@/assets/demo-headshots/voter-17.jpg';
import voter18 from '@/assets/demo-headshots/voter-18.jpg';
import voter19 from '@/assets/demo-headshots/voter-19.jpg';
import voter20 from '@/assets/demo-headshots/voter-20.jpg';

const demoHeadshots = [
  voter01, voter02, voter03, voter04, voter05, voter06, voter07, voter08, voter09, voter10,
  voter11, voter12, voter13, voter14, voter15, voter16, voter17, voter18, voter19, voter20,
];

export const DEMO_SUMMARY = {
  totalVoters: 1_000_000,
  supporters: 281_402,
  mandateTarget: 17,
  targetVotes: 510_000,
  sentimentBreakdown: { positive: 6420, negative: 1840, neutral: 2740 },
  narrative:
    'מגמת גידול משמעותית בתמיכה באזור המרכז - תל אביב וראשון לציון מציגות עלייה של 12% בחודש האחרון. ירושלים מסווגת כ"ניתנת לשכנוע" עם פוטנציאל גבוה. הצפון מציג יציבות, והנגב דורש חיזוק מיידי בקמפיין SMS.',
  mapboxToken: '',
  cityClusters: [
    { city: 'תל אביב', count: 42_180, positive: 32_000, negative: 3_100, neutral: 7_080 },
    { city: 'ראשון לציון', count: 28_400, positive: 21_000, negative: 2_400, neutral: 5_000 },
    { city: 'ירושלים', count: 35_600, positive: 18_000, negative: 8_200, neutral: 9_400 },
    { city: 'חיפה', count: 22_100, positive: 14_500, negative: 3_200, neutral: 4_400 },
    { city: 'באר שבע', count: 15_800, positive: 8_200, negative: 3_600, neutral: 4_000 },
    { city: 'נתניה', count: 12_600, positive: 8_800, negative: 1_400, neutral: 2_400 },
    { city: 'פתח תקווה', count: 11_200, positive: 7_600, negative: 1_600, neutral: 2_000 },
    { city: 'אשדוד', count: 9_800, positive: 5_400, negative: 2_200, neutral: 2_200 },
  ],
};

export const DEMO_CAMPAIGNS = [
  { id: '1', name: 'גיוס בוחרים בתל אביב', description: 'קמפיין דיגיטלי ממוקד לתל אביב', status: 'active', total_sent: 45_200, total_clicks: 12_800, created_at: '2025-01-15' },
  { id: '2', name: 'סקר מדיניות מס', description: 'סקר עמדות מיסוי ארצי', status: 'completed', total_sent: 120_000, total_clicks: 38_400, created_at: '2024-12-01' },
  { id: '3', name: 'שכנוע מתלבטים בראשון לציון', description: 'שכנוע מתלבטים בראשון', status: 'active', total_sent: 28_600, total_clicks: 9_100, created_at: '2025-02-10' },
  { id: '4', name: 'חיזוק מעורבות בירושלים', description: 'חיזוק מעורבות בירושלים', status: 'paused', total_sent: 65_000, total_clicks: 18_200, created_at: '2024-11-20' },
  { id: '5', name: 'קמפיין סטודנטים בחיפה', description: 'קמפיין סטודנטים בחיפה', status: 'completed', total_sent: 32_000, total_clicks: 11_500, created_at: '2024-10-05' },
  { id: '6', name: 'מבצע SMS בנגב', description: 'SMS מסיבי לנגב', status: 'completed', total_sent: 88_000, total_clicks: 22_000, created_at: '2024-09-15' },
  { id: '7', name: 'דחיפת מדיניות ביטחון', description: 'הפצת מדיניות ביטחון', status: 'active', total_sent: 150_000, total_clicks: 47_000, created_at: '2025-03-01' },
  { id: '8', name: 'קמפיין כלכלה תחילה', description: 'קמפיין כלכלה ראשונה', status: 'completed', total_sent: 72_000, total_clicks: 19_800, created_at: '2024-08-22' },
  { id: '9', name: 'יוזמת מצביעים צעירים', description: 'יוזמת צעירים 18-25', status: 'active', total_sent: 55_000, total_clicks: 21_300, created_at: '2025-01-28' },
  { id: '10', name: 'פנייה לגמלאים', description: 'תקשורת עם גמלאים', status: 'completed', total_sent: 40_000, total_clicks: 8_200, created_at: '2024-07-10' },
  { id: '11', name: 'סקר משבר הדיור', description: 'סקר משבר הדיור', status: 'completed', total_sent: 95_000, total_clicks: 31_200, created_at: '2024-06-18' },
  { id: '12', name: 'ביטחון גבול הצפון', description: 'ביטחון גבול צפון', status: 'paused', total_sent: 48_000, total_clicks: 14_100, created_at: '2024-11-05' },
  { id: '13', name: 'קמפיין רפורמת חינוך', description: 'קמפיין רפורמת חינוך', status: 'active', total_sent: 62_000, total_clicks: 18_900, created_at: '2025-02-20' },
  { id: '14', name: 'הבטחת מערכת הבריאות', description: 'הבטחת בריאות לכולם', status: 'completed', total_sent: 110_000, total_clicks: 35_600, created_at: '2024-05-30' },
  { id: '15', name: 'מבצע הצבעה בשבוע האחרון', description: 'הנעה לקלפיות - שבוע אחרון', status: 'scheduled', total_sent: 0, total_clicks: 0, created_at: '2025-04-10' },
];

const demoNames = [
  'דני כהן', 'מיכאל לוי', 'אורי שמיר', 'נועם ברק', 'יוספה אברהם',
  'רונית פרידמן', 'אלון גולן', 'שמעון מזרחי', 'עדי דוד', 'הדר כץ',
  'גל נבון', 'יעל סלע', 'תומר אדלר', 'הלל צור', 'מאיה ביטון',
  'ליאור דגן', 'סיון ברקאי', 'אריאל מלכה', 'נעמה קפלן', 'שי מור',
  'אמיר רוזן', 'רועי פרץ', 'גלעד בן דוד', 'יונתן אשכנזי', 'דנה אברהמי',
  'איילת כהנא', 'משה שטרן', 'אבי מלמד', 'טליה גולן', 'כרמית לוי',
  'מורן שפירא', 'ענת אלון', 'עמוס ברק', 'רמי סלע', 'מיכל דיין',
  'יצחק רגב', 'הילה שמיר', 'נועה כץ', 'ליאת נבון', 'איתן פרידמן',
  'ניר כהן', 'אסף לוי', 'אורי שמר', 'עומר ברק', 'יעל אברהם',
  'רחל פרידמן', 'אלעד גולן', 'שחר מזרחי', 'רותם דוד', 'שרון כץ',
];

// Deep conversations for first 5 users (5+ exchanges each, city-specific topics)
const deepConversations: Record<number, Array<{ role: 'ai' | 'voter'; content: string; month: number }>> = {
  0: [ // דני כהן - תל אביב - מיסוי
    { role: 'ai', content: 'שלום דני! אני מהצוות שלנו. רציתי לדבר איתך על הנושאים שמעניינים אותך לקראת הבחירות.', month: 0 },
    { role: 'voter', content: 'היי, תשמעי - אני מתל אביב. יוקר המחיה פה הרג אותנו. הארנונה עלתה שוב', month: 0 },
    { role: 'ai', content: 'אני שומעת אותך דני. יוקר המחיה בתל אביב הוא אחד הנושאים המרכזיים שלנו. יש לנו תוכנית להקפאת ארנונה ל-3 שנים ותמריצי מס לעצמאים. רוצה פרטים?', month: 0 },
    { role: 'voter', content: 'הקפאת ארנונה? זה נשמע טוב מדי. איך תממנו את זה?', month: 1 },
    { role: 'ai', content: 'שאלה מצוינת. המימון מגיע מקיצוץ בבירוקרטיה ממשלתית ומיסוי חברות טכנולוגיה רב-לאומיות שפועלות כאן בלי לשלם מס מלא. יש לנו מסמך מפורט - שולחת לך קישור.', month: 1 },
    { role: 'voter', content: 'קראתי את המסמך. חלק מהרעיונות טובים, אבל מה עם הביטחון? אני גר ליד הים ובקיץ היו אזעקות', month: 2 },
    { role: 'ai', content: 'דני, הביטחון הוא חלק בלתי נפרד מהתוכנית. הקמפיין שלנו, עם רקע ביטחוני מובהק, דוגלת בהגנה אקטיבית - כולל כיפת ברזל ימית למרכז. מה דעתך?', month: 2 },
    { role: 'voter', content: 'כיפת ברזל ימית? זה קיים?', month: 3 },
    { role: 'ai', content: 'כן, זה פרויקט שנמצא בפיתוח ואנחנו דוחפים לזרז אותו. אנחנו מאמינים שתל אביב צריכה להיות מוגנת מכל הכיוונים 🛡️', month: 3 },
    { role: 'voter', content: 'אוקיי שכנעתם אותי. אני בפנים. כל קול נגד יוקר המחיה חשוב 💪', month: 4 },
    { role: 'ai', content: 'תודה רבה דני! אנחנו מזמינים אותך לכנס תומכים בתל אביב בשבוע הבא. שולח לך פרטים. כל קול חשוב! 🎉', month: 5 },
  ],
  1: [ // מיכל לוי - ראשון לציון - חינוך
    { role: 'ai', content: 'שלום מיכל! כאן הצוות שלנו. ראינו שנושא החינוך חשוב לך - נשמח לשמוע מה דעתך.', month: 0 },
    { role: 'voter', content: 'היי, כן. אני אמא לשלושה בראשון לציון. בתי הספר פה במצב קשה - כיתות צפופות, אין מספיק מורים', month: 0 },
    { role: 'ai', content: 'את צודקת מיכל. התוכנית שלנו כוללת תוספת של 15,000 מורים חדשים ארצית, הקטנת כיתות ל-25 תלמידים, ותוספת שעות העשרה. רוצה לראות את התוכנית המלאה?', month: 1 },
    { role: 'voter', content: 'כן בבקשה. ואיך לגבי מחיר הצהרונים? זה הורג אותנו כלכלית', month: 1 },
    { role: 'ai', content: 'שאלה חשובה! אנחנו מציעים צהרון חינם עד גיל 9 ותמיכה כלכלית להורים עובדים. הנה קישור למסמך המלא 📄', month: 2 },
    { role: 'voter', content: 'קראתי. הרעיונות טובים אבל שמעתי את אותן הבטחות מפוליטיקאים אחרים', month: 2 },
    { role: 'ai', content: 'מבינה את הספקנות מיכל. ההבדל הוא שאנחנו כבר קידמנו חוק צהרונים חינם בכנסת הקודמת. היא לא רק מדברת - היא עושה. רוצה לראות מה היא כבר השיגה?', month: 3 },
    { role: 'voter', content: 'כן, שלחי לי. חשוב לי לראות תוצאות אמיתיות', month: 3 },
    { role: 'ai', content: 'שולחת! ובנוסף - יש לנו מפגש הורים עם הצוות בראשון לציון בשבוע הבא. מעוניינת להצטרף?', month: 4 },
    { role: 'voter', content: 'אני מגיעה! ואני אביא עוד שלוש חברות. שכנעתם אותנו 😊', month: 5 },
    { role: 'ai', content: 'מדהים מיכל! כל הורה שמצביע למען חינוך טוב - משנה עתיד. נשמח לראות אתכן! 🎉', month: 5 },
  ],
  2: [ // אורי שמיר - ירושלים - ביטחון
    { role: 'ai', content: 'שלום אורי! הצוות שלנו כאן. מה הנושא שהכי מעסיק אותך לקראת הבחירות?', month: 0 },
    { role: 'voter', content: 'ביטחון. אני גר בירושלים ובחודשים האחרונים המצב ביטחוני קשה מאוד', month: 0 },
    { role: 'ai', content: 'אורי, הביטחון הוא הנושא מספר 1 שלנו. הקמפיין שלנו, עם רקע ביטחוני מובהק, מובילה גישה של אפס סובלנות לטרור ותגובה מיידית. רוצה לשמוע על התוכנית?', month: 1 },
    { role: 'voter', content: 'כן. מה ההצעות הקונקרטיות? נמאס מסיסמאות', month: 1 },
    { role: 'ai', content: 'בהחלט, הנה הנקודות: 1) תגבורת של 5,000 שוטרים בירושלים 2) מצלמות חכמות עם AI בכל שכונה 3) הריסת בתים של מחבלים תוך 48 שעות. זו גישה תקיפה ומידית.', month: 2 },
    { role: 'voter', content: 'זה נשמע רציני. אבל מה לגבי הדיפלומטיה? אי אפשר רק בכוח', month: 2 },
    { role: 'ai', content: 'צודק. אנחנו תומכים גם בדיפלומטיה מבוססת כוח - הסכמי אברהם סגנון. שלום עם מי שרוצה שלום, ותגובה נחרצת למי שבוחר בטרור.', month: 3 },
    { role: 'voter', content: 'אוקיי, זה מתחבר לי. אני חושב שאצביע לכם', month: 4 },
    { role: 'ai', content: 'תודה אורי! ירושלים צריכה להיות עיר בטוחה לכולם. אנחנו מזמינים אותך לכנס ביטחון בעיר הבירה 🇮🇱', month: 5 },
  ],
  3: [ // נועה ברק - חיפה - סביבה
    { role: 'ai', content: 'שלום נועה! כאן הצוות שלנו. ראינו שנושא הסביבה חשוב לך. רוצה לדבר על זה?', month: 0 },
    { role: 'voter', content: 'כן! אני מחיפה ומפרץ חיפה הוא אסון אקולוגי. ילדים פה חולים. משהו חייב להשתנות', month: 0 },
    { role: 'ai', content: 'את צודקת לגמרי נועה. אנחנו מחויבים לסגירת מפעלים מזהמים במפרץ חיפה תוך 3 שנים, ולהמרה לאנרגיה ירוקה. זה לא רק סביבה - זה בריאות של ילדים.', month: 1 },
    { role: 'voter', content: 'איך תסגרו מפעלים? אנשים יפסידו עבודה', month: 1 },
    { role: 'ai', content: 'שאלה חשובה. התוכנית כוללת הסבת עובדים לתעשיית הטק הירוק - חיפה יכולה להפוך למרכז Hi-Tech סביבתי. יש לנו תקציב ייעודי לזה.', month: 2 },
    { role: 'voter', content: 'Hi-Tech ירוק? זה נשמע מעניין. יש דוגמאות מהעולם?', month: 2 },
    { role: 'ai', content: 'בהחלט! קופנהגן, ברלין ונקובר עברו תהליכים דומים. שולחת לך מחקר השוואתי שהכנו 📊', month: 3 },
    { role: 'voter', content: 'קראתי - מרשים. אני בפנים! 🌿', month: 4 },
    { role: 'ai', content: 'תודה נועה! כל קול למען אוויר נקי בחיפה - משנה חיים. נשמח לראות אותך בכנס סביבה שלנו! 💚', month: 5 },
  ],
  4: [ // יוסי אברהם - באר שבע - כלכלה/פריפריה
    { role: 'ai', content: 'שלום יוסי! אני מהצוות שלנו. רוצה לשמוע מה חשוב לך בבחירות הקרובות.', month: 0 },
    { role: 'voter', content: 'שלום. אני מבאר שבע ונמאס לי שהפריפריה מקבלת פירורים. כל הכסף הולך למרכז', month: 0 },
    { role: 'ai', content: 'יוסי, את צודק ב-100%. אנחנו מגיעים מהפריפריה ויודעים מה זה. התוכנית שלנו כוללת: העברת משרדי ממשלה לנגב, רכבת מהירה באר שבע-תל אביב, והקמת קמפוס היי-טק בבאר שבע.', month: 1 },
    { role: 'voter', content: 'רכבת מהירה? על זה מדברים כבר 20 שנה', month: 1 },
    { role: 'ai', content: 'צודק שיש תסכול. ההבדל הוא שאנחנו כבר חתמנו על הצעת חוק עם לוח זמנים מחייב ותקציב ייעודי. זה לא הבטחה - זה תוכנית עם תאריכים.', month: 2 },
    { role: 'voter', content: 'מעניין. ומה לגבי תעסוקה בנגב? אין מספיק מקומות עבודה טובים', month: 2 },
    { role: 'ai', content: 'בדיוק בשביל זה הקמפוס - שיתוף פעולה עם BGU, חברות הזנק, ומענקים לחברות שפותחות משרדים בנגב. המטרה: 10,000 משרות חדשות תוך 4 שנים.', month: 3 },
    { role: 'voter', content: 'אם באמת תעשו את זה - אני איתכם. הנגב צריך מהפכה', month: 4 },
    { role: 'ai', content: 'תודה יוסי! הנגב הוא העתיד של ישראל ואנחנו לא נשכח אתכם. מוזמן לכנס שלנו בבאר שבע 🏜️🇮🇱', month: 5 },
  ],
};

// Shorter conversations for users 5-9 (2-3 exchanges)
const shortConversations: Record<number, Array<{ role: 'ai' | 'voter'; content: string; month: number }>> = {
  5: [ // רונית פרידמן - נתניה
    { role: 'ai', content: 'שלום רונית! כאן הצוות שלנו. מה הנושא שהכי מעסיק אותך?', month: 0 },
    { role: 'voter', content: 'שלום, בעיקר בריאות. התורים בקופת חולים אצלנו בנתניה - חודשים!', month: 0 },
    { role: 'ai', content: 'מבינה לגמרי רונית. יש לנו תוכנית לפתיחת 50 מרפאות ערב ברחבי הארץ, כולל נתניה. רוצה לשמוע עוד? 🏥', month: 1 },
    { role: 'voter', content: 'כן, שלחי לי פרטים. זה נשמע חשוב', month: 1 },
  ],
  6: [ // אלון גולן - פתח תקווה
    { role: 'ai', content: 'שלום אלון! הצוות שלנו כאן. מה חשוב לך בבחירות?', month: 0 },
    { role: 'voter', content: 'היי. התחבורה ציבורית - אני נוסע מפתח תקווה לתל אביב כל יום ומבזבז 3 שעות', month: 0 },
    { role: 'ai', content: 'אלון, 3 שעות ביום זה מטורף. התוכנית שלנו כוללת קו רכבל חדש פתח תקווה-תל אביב ותוספת אוטובוסים מהירים. רוצה את המסמך המלא? 🚊', month: 1 },
  ],
  7: [ // שירה מזרחי - אשדוד
    { role: 'ai', content: 'שלום שירה! כאן הצוות שלנו. מה חשוב לך?', month: 0 },
    { role: 'voter', content: 'ביטחון באשדוד. עוד סבב והעיר שלנו בקו האש', month: 0 },
    { role: 'ai', content: 'שירה, הביטחון שלך ושל המשפחה הוא בראש סדר העדיפויות. אנחנו דוחפים למערכת הגנה משופרת לערי הדרום כולל מקלטים חדשים ומערכת התרעה משודרגת. 🛡️', month: 1 },
    { role: 'voter', content: 'סוף סוף מישהו שמדבר על אשדוד. תודה', month: 2 },
  ],
  8: [ // עמית דוד - תל אביב
    { role: 'ai', content: 'שלום עמית! הצוות שלנו. מעניין אותך לשמוע על התוכנית הכלכלית שלנו?', month: 0 },
    { role: 'voter', content: 'אני סטודנט. אין לי כסף לשכירות בתל אביב. יש לכם פתרון?', month: 0 },
    { role: 'ai', content: 'עמית, אנחנו מציעים מענק דיור לסטודנטים ותוכנית דירות להשכרה בפיקוח. שולח לך פרטים! 🏠', month: 1 },
  ],
  9: [ // הדר כץ - ירושלים
    { role: 'ai', content: 'שלום הדר! כאן הצוות שלנו. מה הנושא שמעסיק אותך?', month: 0 },
    { role: 'voter', content: 'תרבות בירושלים. העיר מתה בלילה, אין חיי לילה, אין תרבות', month: 0 },
    { role: 'ai', content: 'הדר, ירושלים היא עיר עם פוטנציאל תרבותי עצום. אנחנו מציעים הקמת רובע תרבות חדש ושעות פתיחה מורחבות למוזיאונים. רוצה לשמוע עוד? 🎭', month: 1 },
  ],
  10: [
    { role: 'ai', content: 'שלום גל, בדקנו שהנושא הכלכלי חשוב לך. מה הכי מפריע לך היום?', month: 0 },
    { role: 'voter', content: 'מס הכנסה ויוקר מחיה. צריך מישהו שמבין עצמאים.', month: 0 },
    { role: 'ai', content: 'בדיוק לשם אנחנו מכוונים: הפחתת רגולציה לעצמאים ומדרגת מס פשוטה יותר. שולחת תקציר ממוקד.', month: 1 },
  ],
  11: [
    { role: 'ai', content: 'שלום יעל, ראינו פעילות גבוהה שלך סביב נושא הביטחון האישי.', month: 0 },
    { role: 'voter', content: 'נכון. אני רוצה תוכנית מעשית, לא סיסמאות.', month: 0 },
    { role: 'ai', content: 'התוכנית שלנו כוללת תגבור שיטור, מצלמות חכמות ומוקד תגובה עירוני. אפשר לשלוח לך את המסמך?', month: 1 },
  ],
};

const months = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'];
const demoChannels = ['whatsapp', 'instagram', 'messenger', 'tiktok', 'signal', 'x', 'facebook', 'sms'] as const;
const demoInteractionScenarios = [
  ['ראיתי את הסרטון בטיקטוק. יש לכם מספרים אמיתיים או שזה עוד סלוגן?', 'שאלה לגיטימית. מצרפת מקור, תקציב ולוח זמנים - בלי הבטחות ריקות. סימנתי גם שנציג שטח יחזור אליך.'],
  ['אני כועס. הבטיחו לנו ביטחון כבר שנים וכלום לא השתנה.', 'מבינה את הכעס ולא מבטלת אותו. אני מסכמת לך רק צעדים ביצועיים: תגבור כוחות, מוקד עירוני ולוחות זמנים - ואם תרצה נעביר לנציג אנושי.'],
  ['הסטורי באינסטגרם היה טוב, אבל מה עם העיר שלי?', 'בדקתי לפי העיר שלך והעברתי אותך למסלול מקומי. שולחת עכשיו תוכנית אזורית קצרה ולא מסר כללי.'],
  ['תפסיקו לשלוח לי הודעות. זה מציק.', 'קיבלתי. עצרתי הודעות שיווקיות וסימנתי העדפת קשר נמוכה. אם תרצה בעתיד, אפשר להמשיך רק בערוץ שתבחר.'],
  ['אני מתלבט. מצד אחד מסכים איתכם, מצד שני לא סומך על פוליטיקאים.', 'זה הוגן. במקום לשכנע בסיסמאות, אני שולחת שלוש התחייבויות מדידות ומעקב ביצוע פתוח לציבור.'],
  ['שלחתי שאלה בפייסבוק ואף אחד לא ענה לי.', 'צודק, זה לא היה צריך לקרות. איחדתי את הפנייה כאן, סימנתי SLA דחוף, וה-AI עונה עכשיו עם תקציר ברור.'],
  ['ב-X כתבו שהתוכנית שלכם לא ממומנת. נכון?', 'בדקתי את הטענה. יש סעיף תקציבי מפורט - מצרפת קישור ומסמנת לצוות הדיגיטל להגיב גם בפומבי.'],
  ['אפשר פרטים על הסעה לקלפי לאמא שלי?', 'כן. סימנתי בקשת הסעה, שמרתי את הערוץ המועדף, ונציג לוגיסטיקה יחזור עם שעה מדויקת.'],
];

const buildOmniFollowUps = (index: number, name: string, city: string, topic: string) => {
  const [voterConcern, aiResponse] = demoInteractionScenarios[index % demoInteractionScenarios.length];
  const firstName = name.split(' ')[0];
  const primary = demoChannels[index % demoChannels.length];
  const secondary = demoChannels[(index + 3) % demoChannels.length];
  const tertiary = demoChannels[(index + 5) % demoChannels.length];

  return [
    { role: 'voter' as const, channel: primary, content: voterConcern, month: 5 },
    { role: 'ai' as const, channel: secondary, content: `${firstName}, ${aiResponse}`, month: 5 },
    { role: 'voter' as const, channel: tertiary, content: index % 4 === 0 ? 'אוקיי, זה יותר מכבד. תמשיכו רק כאן.' : `תודה. מעניין אותי גם נושא ${topic} ב${city}.`, month: 5 },
    { role: 'ai' as const, channel: demoChannels[(index + 7) % demoChannels.length], content: index % 5 === 0 ? 'מעולה. עדכנתי העדפות קשר, עצרתי כפילויות בין ערוצים, והשיחה תישאר במעקב AI.' : 'קיבלתי. איחדתי את כל הערוצים לפרופיל אחד והעברתי לצוות השטח עם הקשר המלא.', month: 5 },
  ];
};

// Generate realistic recent timestamps for demo
function recentTimestamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const recentOffsets = Array.from({ length: 50 }, (_, i) => [2, 5, 9, 14, 22, 31, 44, 58, 76, 95, 130, 175, 240, 330, 480, 720, 980, 1440][i % 18] + Math.floor(i / 18) * 11); // minutes ago per voter
const demoTopics = [
  { tag: 'ביטחון', key: 'security', voter: 'הביטחון האישי והתגובה לטרור חשובים לי מאוד.', ai: 'מבינה אותך. שלחתי לך תוכנית קצרה עם צעדים מעשיים לפי העיר שלך.' },
  { tag: 'כלכלה', key: 'economy', voter: 'יוקר המחיה והעסק הקטן שלי הם הנושא המרכזי מבחינתי.', ai: 'בדיוק בזה אנחנו מתמקדים: פחות רגולציה, מס פשוט יותר ותמריצים לעצמאים.' },
  { tag: 'משפט', key: 'judicial', voter: 'חשוב לי להבין איך תשמרו על איזון בין הרשויות.', ai: 'שולחת לך מסמך עמדה ברור על רפורמה אחראית, שקופה ומדורגת.' },
  { tag: 'חברה', key: 'social', voter: 'אני רוצה לראות יותר שירותים קהילתיים ועזרה למשפחות.', ai: 'מסכימה. סימנתי אותך לקמפיין משפחות וקהילה באזור שלך.' },
  { tag: 'ממשל', key: 'governance', voter: 'נמאס מבירוקרטיה. צריך ממשלה שעובדת מהר.', ai: 'זו בדיוק ההתחייבות: שירותים דיגיטליים, מדדי ביצוע ושקיפות לציבור.' },
];

const buildInterestScores = (index: number) => {
  const main = demoTopics[index % demoTopics.length].key;
  const scores = { security: 28 + ((index * 7) % 45), economy: 24 + ((index * 11) % 48), judicial: 18 + ((index * 13) % 42), social: 20 + ((index * 17) % 44), governance: 22 + ((index * 19) % 46) } as Record<string, number>;
  scores[main] = 72 + ((index * 5) % 24);
  return scores;
};

function generateDemoThread(name: string, voterId: string, index: number) {
  const conversation = index < 5
    ? deepConversations[index]
    : shortConversations[index];
  const city = DEMO_SUMMARY.cityClusters[index % DEMO_SUMMARY.cityClusters.length].city;

  const fallbackTopic = demoTopics[index % demoTopics.length];
  const activeConversation = conversation ?? [
    { role: 'ai' as const, content: `שלום ${name.split(' ')[0]}, ראינו שנושא ${fallbackTopic.tag} חשוב לך. אפשר לשמוע מה הכי מטריד אותך?`, month: 0 },
    { role: 'voter' as const, content: fallbackTopic.voter, month: 0 },
    { role: 'ai' as const, content: fallbackTopic.ai, month: 1 },
    { role: 'voter' as const, content: index % 3 === 0 ? 'נשמע טוב, שלחו לי עוד פרטים ואשקול להצטרף.' : 'תודה, זה יותר ברור עכשיו.', month: 2 },
  ];

  const baseMinutesAgo = recentOffsets[index] ?? 60;

  const expanded = [
    ...activeConversation.map((m, i) => ({ ...m, channel: demoChannels[(index + i) % demoChannels.length] })),
    ...buildOmniFollowUps(index, name, city, fallbackTopic.tag),
  ];
  const totalMessages = expanded.length;

  return expanded.map((m, i) => ({
    id: `demo-${voterId}-${i}`,
    lead_id: voterId,
    content: m.content,
    role: m.role === 'ai' ? 'assistant' : 'user',
    sender_type: m.role,
    channel: m.channel,
    direction: m.role === 'ai' ? 'outbound' : 'inbound',
    platform: m.channel,
    sentiment: m.month >= 4 ? 'positive' : m.month >= 2 ? 'neutral' : null,
    created_at: recentTimestamp(baseMinutesAgo + (totalMessages - i) * 3),
    metadata: {},
    is_demo: true,
  }));
}

export const DEMO_VOTERS = demoNames.map((name, i) => ({
  id: `demo-voter-${i}`,
  full_name: name,
  phone_number: `97250${String(1000000 + i * 111111).slice(0, 7)}`,
  city: DEMO_SUMMARY.cityClusters[i % DEMO_SUMMARY.cityClusters.length].city,
  status: ['supporter', 'lead', 'active', 'contacted', 'inactive'][i % 5],
  sentiment: ['positive', 'neutral', 'negative', 'neutral', 'positive', 'negative'][i % 6],
  engagement_score: 38 + ((i * 9) % 58),
  loyalty_tier: i < 4 ? 'champion' : i < 7 ? 'engaged' : 'new',
  ai_autopilot: true,
  created_at: recentTimestamp(20_000 - i * 180),
  is_demo: true,
  last_interaction_at: recentTimestamp(recentOffsets[i] ?? 60),
  profile_picture_url: demoHeadshots[i % demoHeadshots.length],
  identity_number: String(100000000 + i * 3791).slice(0, 9),
  instagram_handle: `kalpiz_${i}`,
  telegram_username: `kalpiz_voter_${i}`,
  messenger_id: `msgr-${i}`,
  tiktok_handle: `kalpiz.tok.${i}`,
  signal_number: `+${`97250${String(1000000 + i * 111111).slice(0, 7)}`}`,
  x_handle: `kalpiz_x_${i}`,
  facebook_id: `fb-${i}`,
  interest_tag: demoTopics[i % demoTopics.length].tag,
  interest_scores: buildInterestScores(i),
  interest_score_json: buildInterestScores(i),
  is_voted: i % 6 === 0,
  fts: null,
}));

export const DEMO_MESSAGES = demoNames.flatMap((name, i) =>
  generateDemoThread(name, `demo-voter-${i}`, i)
);

export const DEMO_KNOWLEDGE_DOCUMENTS = [
  { id: 'demo-kb-1', title: 'מסרי קמפיין מרכזיים 2026', source_type: 'upload', chunk_count: 84, created_at: recentTimestamp(35) },
  { id: 'demo-kb-2', title: 'תשובות AI בנושא ביטחון ויוקר מחיה', source_type: 'whatsapp', chunk_count: 132, created_at: recentTimestamp(90) },
  { id: 'demo-kb-3', title: 'תוכנית שטח לפי ערים ואזורים', source_type: 'upload', chunk_count: 57, created_at: recentTimestamp(240) },
];

export const DEMO_SOCIAL_METRICS = [
  { platform: 'TikTok', views: 184_200, likes: 24_900, comments: 1_340, trend: '+18%' },
  { platform: 'Instagram', views: 96_500, likes: 11_420, comments: 782, trend: '+11%' },
  { platform: 'Facebook', views: 142_800, likes: 8_760, comments: 1_105, trend: '+9%' },
  { platform: 'X', views: 58_300, likes: 3_240, comments: 410, trend: '+6%' },
];

export const DEMO_LIVE_ACTIONS = [
  'שיחת AI Voice הסתיימה עם דני כהן · סווג כתומך',
  'ליד חדש מטיקטוק נכנס למשפך תל אביב',
  'קמפיין WhatsApp הגיע ל-85% מסירה',
  'ה-AI ענה אוטומטית ל-14 שאלות בנושא ביטחון',
  'תגובה חיובית מאינסטגרם הפכה למשימת מעקב',
];

// District-level data for SVG map - 7 official Israeli districts + Judea & Samaria
export interface DistrictData {
  intensity: number;
  label: string;
  color: 'green' | 'yellow' | 'red' | 'orange';
  supporters: number;
  totalVoters: number;
  cities: string[];
}

export const DEMO_DISTRICTS: Record<string, DistrictData> = {
  'north': { intensity: 48, label: 'צפון', color: 'orange', supporters: 18_200, totalVoters: 45_000, cities: ['טבריה', 'צפת', 'כרמיאל', 'נצרת'] },
  'haifa': { intensity: 72, label: 'חיפה', color: 'green', supporters: 22_100, totalVoters: 38_000, cities: ['חיפה', 'קריות', 'עכו'] },
  'center': { intensity: 78, label: 'מרכז', color: 'green', supporters: 42_800, totalVoters: 68_000, cities: ['פתח תקווה', 'נתניה', 'רעננה', 'כפר סבא'] },
  'tel-aviv': { intensity: 92, label: 'תל אביב', color: 'green', supporters: 58_400, totalVoters: 82_000, cities: ['תל אביב', 'רמת גן', 'בני ברק', 'חולון'] },
  'jerusalem': { intensity: 55, label: 'ירושלים', color: 'yellow', supporters: 24_600, totalVoters: 55_000, cities: ['ירושלים', 'בית שמש', 'מעלה אדומים'] },
  'south': { intensity: 35, label: 'דרום', color: 'red', supporters: 12_400, totalVoters: 42_000, cities: ['באר שבע', 'אשדוד', 'אשקלון', 'ראשון לציון'] },
  'judea-samaria': { intensity: 42, label: 'יהודה ושומרון', color: 'orange', supporters: 8_800, totalVoters: 28_000, cities: ['אריאל', 'מודיעין עילית', 'ביתר עילית'] },
};

// Major city hotspots for pulse animations
export const CITY_HOTSPOTS = [
  { id: 'tel-aviv', label: 'תל אביב', x: 88, y: 282, district: 'tel-aviv', voters: 42_180 },
  { id: 'jerusalem', label: 'ירושלים', x: 148, y: 298, district: 'jerusalem', voters: 35_600 },
  { id: 'haifa', label: 'חיפה', x: 105, y: 145, district: 'haifa', voters: 22_100 },
  { id: 'beer-sheva', label: 'באר שבע', x: 115, y: 395, district: 'south', voters: 15_800 },
  { id: 'rishon', label: 'ראשון לציון', x: 95, y: 305, district: 'south', voters: 28_400 },
];

export type DemoCandidateId =
  | 'primary-single'
  | 'primary-slate'
  | 'national-small'
  | 'national-mid'
  | 'national-large';

export const DEMO_CANDIDATES: Array<{
  id: DemoCandidateId;
  name: string;
  shortLabel: string;
  mandateGoal: number;
  electionType: 'national' | 'primaries';
  scale: 'small' | 'medium' | 'large';
  focus: string[];
  crisis: string;
  narrative: string;
}> = [
  {
    id: 'primary-single',
    name: 'חבר/ת כנסת בפריימריז',
    shortLabel: 'מועמד יחיד · פריימריז',
    mandateGoal: 1,
    electionType: 'primaries',
    scale: 'small',
    focus: ['פעילי מפלגה', 'מסר אישי', 'נוכחות בשטח'],
    crisis: 'תחרות חריפה על מקום ריאלי ברשימה',
    narrative: 'קמפיין פריימריז ממוקד פעילים: כל פעיל הוא קול קריטי, יתרון תחרותי במסר אישי וזמינות בשטח.',
  },
  {
    id: 'primary-slate',
    name: 'קבוצת מועמדים בפריימריז',
    shortLabel: 'קבוצה / רשימה · פריימריז',
    mandateGoal: 4,
    electionType: 'primaries',
    scale: 'medium',
    focus: ['תיאום מסר', 'חלוקת אזורים', 'הצבעה משולבת'],
    crisis: 'ניהול תיאום פנימי בין מועמדי הקבוצה',
    narrative: 'רשימה מתואמת של מועמדים בפריימריז: דאטה משותפת, חלוקת מחוזות, וקריאות הצבעה כפולות לפעילים.',
  },
  {
    id: 'national-small',
    name: 'מפלגה קטנה / תנועה',
    shortLabel: 'תנועה · מעבר אחוז חסימה',
    mandateGoal: 4,
    electionType: 'national',
    scale: 'small',
    focus: ['בידול חד', 'קהל ליבה', 'מעבר אחוז חסימה'],
    crisis: 'סקרים על גבול אחוז החסימה',
    narrative: 'תנועה צעירה במרוץ ארצי: כל מנדט נמדד באלפי קולות; הדגש על שימור קהל הליבה והוכחת חיוניות.',
  },
  {
    id: 'national-mid',
    name: 'מפלגה בינונית',
    shortLabel: 'מפלגה בינונית · ארצי',
    mandateGoal: 12,
    electionType: 'national',
    scale: 'medium',
    focus: ['יוקר המחיה', 'ביטחון אישי', 'אחדות'],
    crisis: 'תחרות על מצביעים מתלבטים מול גוש שכן',
    narrative: 'מפלגה בינונית במרוץ הארצי: מאבק על מתלבטים בגוש, ניהול הדוק של שיח רשתות והקרנת יציבות.',
  },
  {
    id: 'national-large',
    name: 'מפלגה גדולה',
    shortLabel: 'מפלגה גדולה · ארצי',
    mandateGoal: 28,
    electionType: 'national',
    scale: 'large',
    focus: ['ממלכתיות', 'הובלת ממשלה', 'מסרים רחבים'],
    crisis: 'ניהול כותרות תקשורתיות וחזית רב-זירתית',
    narrative: 'מפלגה גדולה במרוץ להובלת הממשלה: קמפיין רחב, ניהול כותרות יומי וריבוי קהלי יעד מקבילים.',
  },
];

const getCandidate = (candidateId?: DemoCandidateId | null) => DEMO_CANDIDATES.find((candidate) => candidate.id === candidateId) ?? DEMO_CANDIDATES[0];

// Realistic Israeli campaign math:
//  - National elections: ~40,000 valid votes per Knesset mandate.
//  - Primaries: ~200 registered party voters per "delegate" / realistic-spot signal.
const VOTES_PER_NATIONAL_MANDATE = 40_000;
const VOTES_PER_PRIMARY_DELEGATE = 200;

export const getDemoCandidateSummary = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const targetVotes = candidate.electionType === 'primaries'
    ? candidate.mandateGoal * VOTES_PER_PRIMARY_DELEGATE
    : candidate.mandateGoal * VOTES_PER_NATIONAL_MANDATE;

  // Conversion ratio of confirmed supporters to target votes, by scale.
  const supporterRatio = candidate.scale === 'large' ? 0.74 : candidate.scale === 'medium' ? 0.62 : 0.5;
  const supporters = Math.round(targetVotes * supporterRatio);

  // Sentiment volume scales with the addressable universe, not just mandates.
  const baseVolume = Math.max(800, Math.round(targetVotes / 120));
  return {
    ...DEMO_SUMMARY,
    mandateTarget: candidate.mandateGoal,
    targetVotes,
    supporters,
    narrative: candidate.narrative,
    sentimentBreakdown: {
      positive: Math.round(baseVolume * 0.62),
      negative: Math.round(baseVolume * 0.14),
      neutral: Math.round(baseVolume * 0.24),
    },
  };
};

// Kalpiz global pricing (matches https://kalpiz.co.il/pricing).
// Single source of truth for plan base + setup fee — keeps in-app numbers
// consistent with the public pricing list across demo + real modes.
export const KALPIZ_PLANS = {
  breakthrough: { slug: 'breakthrough', name: 'מסלול פריצה', monthly: 2999, mandates: 1 },
  power:        { slug: 'power',        name: 'מסלול עוצמה', monthly: 7999, mandates: 3 },
  victory:      { slug: 'victory',      name: 'מסלול ניצחון', monthly: 14999, mandates: 10 },
} as const;
export const KALPIZ_SETUP_FEE = 5000;

// Pick the recommended plan for a given mandate goal (matches calculator logic).
export const pickKalpizPlan = (mandates: number) => {
  if (mandates >= KALPIZ_PLANS.victory.mandates) return KALPIZ_PLANS.victory;
  if (mandates >= KALPIZ_PLANS.power.mandates) return KALPIZ_PLANS.power;
  return KALPIZ_PLANS.breakthrough;
};

// Realistic billing snapshot for the currently-viewed demo profile.
// Anchored to the recommended Kalpiz plan (base subscription + setup fee)
// plus variable usage by service — so all balance/spend numbers in the app
// reflect the public pricing list and the candidate's mandate goal.
export const getDemoBilling = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const isPrimaries = candidate.electionType === 'primaries';
  const targetVotes = isPrimaries
    ? candidate.mandateGoal * VOTES_PER_PRIMARY_DELEGATE
    : candidate.mandateGoal * VOTES_PER_NATIONAL_MANDATE;

  // Recommended plan from public pricing list (₪2,999 / ₪7,999 / ₪14,999).
  const plan = pickKalpizPlan(candidate.mandateGoal);
  const planMonthly = plan.monthly;
  const setupFee = KALPIZ_SETUP_FEE;

  // Unit costs (₪, ex-VAT) — must match SubscriptionManager UNIT_COSTS / public pricing.
  const COST = { sms: 0.11, whatsapp: 0.18, ai_voice: 0.42, ai_touchpoint: 0.012, meta_ad: 0.4 };

  // Monthly outreach mix per profile.
  const monthlyMix = isPrimaries
    ? {
        sms: Math.round(targetVotes * 1.2),
        whatsapp: Math.round(targetVotes * 4),
        ai_voice: Math.round(targetVotes * 0.35),
        ai_touchpoint: Math.round(targetVotes * 2.5),
        meta_ad: Math.round(targetVotes * 0.15),
      }
    : candidate.scale === "small"
      ? {
          sms: Math.round(targetVotes * 0.45),
          whatsapp: Math.round(targetVotes * 0.6),
          ai_voice: Math.round(targetVotes * 0.04),
          ai_touchpoint: Math.round(targetVotes * 0.3),
          meta_ad: Math.round(targetVotes * 0.18),
        }
      : candidate.scale === "medium"
        ? {
            sms: Math.round(targetVotes * 0.6),
            whatsapp: Math.round(targetVotes * 0.7),
            ai_voice: Math.round(targetVotes * 0.05),
            ai_touchpoint: Math.round(targetVotes * 0.35),
            meta_ad: Math.round(targetVotes * 0.22),
          }
        : {
            sms: Math.round(targetVotes * 0.75),
            whatsapp: Math.round(targetVotes * 0.85),
            ai_voice: Math.round(targetVotes * 0.06),
            ai_touchpoint: Math.round(targetVotes * 0.45),
            meta_ad: Math.round(targetVotes * 0.28),
          };

  // MTD factor: simulate how far into the month we are.
  const dayOfMonth = new Date().getDate();
  const mtdFactor = Math.min(0.96, dayOfMonth / 30);

  const breakdown = {
    sms: { units: Math.round(monthlyMix.sms * mtdFactor), cost: +(monthlyMix.sms * mtdFactor * COST.sms).toFixed(2) },
    whatsapp: { units: Math.round(monthlyMix.whatsapp * mtdFactor), cost: +(monthlyMix.whatsapp * mtdFactor * COST.whatsapp).toFixed(2) },
    ai_voice: { units: Math.round(monthlyMix.ai_voice * mtdFactor), cost: +(monthlyMix.ai_voice * mtdFactor * COST.ai_voice).toFixed(2) },
    ai_touchpoint: { units: Math.round(monthlyMix.ai_touchpoint * mtdFactor), cost: +(monthlyMix.ai_touchpoint * mtdFactor * COST.ai_touchpoint).toFixed(2) },
    meta_ad: { units: Math.round(monthlyMix.meta_ad * mtdFactor), cost: +(monthlyMix.meta_ad * mtdFactor * COST.meta_ad).toFixed(2) },
  };

  // Variable usage MTD + projected
  const usageMtd = +Object.values(breakdown).reduce((acc, b) => acc + b.cost, 0).toFixed(2);
  const usageMonthlyProjected =
    monthlyMix.sms * COST.sms +
    monthlyMix.whatsapp * COST.whatsapp +
    monthlyMix.ai_voice * COST.ai_voice +
    monthlyMix.ai_touchpoint * COST.ai_touchpoint +
    monthlyMix.meta_ad * COST.meta_ad;

  // True monthly cost = plan base + variable usage (mirrors calculator).
  const monthlyAllIn = planMonthly + usageMonthlyProjected;
  // MTD spend includes the full plan base for the current month + usage so far.
  const mtdSpend = +(planMonthly + usageMtd).toFixed(2);

  // Realistic campaign accounting:
  // - Top-ups: setup fee + 3 months of all-in spend pre-loaded by treasurer.
  // - Total spend: setup fee + 2 prior full months (all-in) + current MTD.
  // - Balance: top-ups − spend (always healthy positive in demo).
  const totalTopups = Math.round(setupFee + monthlyAllIn * 3);
  const totalSpend = +(setupFee + monthlyAllIn * 2 + mtdSpend).toFixed(2);
  const balance = +(totalTopups - totalSpend).toFixed(2);

  const limits = {
    sms: Math.ceil(monthlyMix.sms * COST.sms * 1.1),
    whatsapp: Math.ceil(monthlyMix.whatsapp * COST.whatsapp * 1.1),
    ai_voice: Math.ceil(monthlyMix.ai_voice * COST.ai_voice * 1.1),
    ai_touchpoint: Math.ceil(monthlyMix.ai_touchpoint * COST.ai_touchpoint * 1.1),
    meta_ad: Math.ceil(monthlyMix.meta_ad * COST.meta_ad * 1.1),
  };

  return {
    candidate,
    plan: { slug: plan.slug, name: plan.name, monthly: planMonthly, setupFee },
    balance: { balance, mtd_spend: mtdSpend, total_spend: totalSpend, total_topups: totalTopups },
    breakdown,
    limits,
    monthlyMix,
    monthlyAllIn: +monthlyAllIn.toFixed(2),
    usageMonthlyProjected: +usageMonthlyProjected.toFixed(2),
    mandateTarget: candidate.mandateGoal,
    monthsToElection: isPrimaries ? 3 : 6,
    // Fixed conversion mix per public pricing copy: 40% hot, 10% cold.
    hotConversionRate: 40,
    coldConversionRate: 10,
  };
};

export type DemoTransaction = {
  id: string;
  date: string; // ISO
  description: string;
  category: 'subscription' | 'whatsapp' | 'sms' | 'voice' | 'ai' | 'overage' | 'topup' | 'setup';
  amount: number; // positive = charge, negative = top-up/credit
  status: 'paid' | 'pending';
};

// Build a realistic, story-driven transactions ledger for the selected demo candidate.
// All amounts derive from the same plan + usage numbers used by getDemoBilling, so the
// table reconciles with the top metrics (top-ups, spend, balance).
export const getDemoTransactions = (candidateId?: DemoCandidateId | null): DemoTransaction[] => {
  const billing = getDemoBilling(candidateId);
  const planMonthly = billing.plan.monthly;
  const setupFee = billing.plan.setupFee;
  const planName = billing.plan.name;
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return d.toISOString();
  };
  const fmt = (n: number) => Math.round(n);

  // WhatsApp / SMS bundle sizes scale loosely with plan tier.
  const waBundle = billing.plan.slug === 'victory' ? 50_000 : billing.plan.slug === 'power' ? 20_000 : 10_000;
  const smsBundle = billing.plan.slug === 'victory' ? 25_000 : billing.plan.slug === 'power' ? 10_000 : 5_000;
  const waBundlePrice = fmt(waBundle * 0.18);
  const smsBundlePrice = fmt(smsBundle * 0.11);

  const tx: DemoTransaction[] = [
    // Initial setup
    {
      id: 'tx-setup',
      date: day(82),
      description: 'דמי הקמה חד פעמיים (Onboarding)',
      category: 'setup',
      amount: setupFee,
      status: 'paid',
    },
    {
      id: 'tx-topup-1',
      date: day(80),
      description: 'הטענת תקציב קמפיין רבעוני',
      category: 'topup',
      amount: -fmt(billing.balance.total_topups - setupFee),
      status: 'paid',
    },

    // Two prior monthly subscriptions
    {
      id: 'tx-sub-2',
      date: day(62),
      description: `דמי מנוי חודשיים - חבילת ${planName}`,
      category: 'subscription',
      amount: planMonthly,
      status: 'paid',
    },
    {
      id: 'tx-wa-1',
      date: day(55),
      description: `חבילת ${waBundle.toLocaleString('en-US')} הודעות WhatsApp (WBA)`,
      category: 'whatsapp',
      amount: waBundlePrice,
      status: 'paid',
    },
    {
      id: 'tx-sms-1',
      date: day(48),
      description: `הפצת ${smsBundle.toLocaleString('en-US')} הודעות SMS (019)`,
      category: 'sms',
      amount: smsBundlePrice,
      status: 'paid',
    },

    {
      id: 'tx-sub-1',
      date: day(31),
      description: `דמי מנוי חודשיים - חבילת ${planName}`,
      category: 'subscription',
      amount: planMonthly,
      status: 'paid',
    },
    {
      id: 'tx-overage-1',
      date: day(22),
      description: 'חריגה ממכסת ניתוח סנטימנט (AI Analysis)',
      category: 'overage',
      amount: fmt(billing.usageMonthlyProjected * 0.08),
      status: 'paid',
    },
    {
      id: 'tx-credits-1',
      date: day(11),
      description: `ניצול קרדיטים - קמפיין ווטסאפ ${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`,
      category: 'whatsapp',
      amount: fmt(billing.breakdown.whatsapp.cost * 0.6),
      status: 'paid',
    },

    // Current cycle (in progress)
    {
      id: 'tx-sub-current',
      date: day(2),
      description: `דמי מנוי חודשיים - חבילת ${planName} (מחזור נוכחי)`,
      category: 'subscription',
      amount: planMonthly,
      status: 'pending',
    },
    {
      id: 'tx-voice-human',
      date: day(7),
      description: 'קמפיין קולי (הקלטת מועמד) · 5,000 דקות @ 0.20 ₪',
      category: 'voice',
      amount: 1000,
      status: 'paid',
    },
    {
      id: 'tx-voice-ai',
      date: day(4),
      description: 'קמפיין קולי (AI Text-to-Speech) · 500 דקות @ 1.00 ₪',
      category: 'voice',
      amount: 500,
      status: 'paid',
    },
    {
      id: 'tx-voice-pending',
      date: day(1),
      description: 'שיחות קוליות - חיוב מצרפי שבועי (תעריף משולב 0.20 / 1.00 ₪)',
      category: 'voice',
      amount: fmt(billing.breakdown.ai_voice.cost * 0.25),
      status: 'pending',
    },
  ];

  return tx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

// Services included / connected status for the active plan.
export const getDemoServiceInclusions = (candidateId?: DemoCandidateId | null) => {
  const billing = getDemoBilling(candidateId);
  const slug = billing.plan.slug;
  const waChannelsTotal = slug === 'victory' ? 5 : slug === 'power' ? 3 : 2;
  const waChannelsConnected = slug === 'victory' ? 4 : slug === 'power' ? 2 : 1;
  return [
    { label: 'תובנות AI ללא הגבלה', value: 'פעיל', tone: 'ok' as const },
    { label: 'ערוצי WhatsApp מחוברים', value: `${waChannelsConnected}/${waChannelsTotal}`, tone: 'ok' as const },
    { label: 'ספק SMS פעיל', value: 'Kalpiz', tone: 'ok' as const },
    { label: 'שימוש בקול אנושי / מוקלט', value: '0.20 ₪ לדקה', tone: 'ok' as const },
    { label: 'יצירת קול AI מבוסס טקסט (TTS)', value: '1.00 ₪ לדקה', tone: 'ok' as const },
    { label: 'ניתוח סנטימנט בזמן אמת', value: 'פעיל', tone: 'ok' as const },
    { label: 'מפת מחוזות אינטראקטיבית', value: slug === 'breakthrough' ? 'בסיסי' : 'מלא', tone: (slug === 'breakthrough' ? 'warn' : 'ok') as 'ok' | 'warn' | 'off' },
    { label: 'מנהל הצלחת לקוח ייעודי', value: slug === 'victory' ? '24/7' : slug === 'power' ? 'שבועי' : 'בקשה', tone: 'ok' as const },
    { label: 'ייצוא דוחות חודשיים', value: 'פעיל', tone: 'ok' as const },
  ];
};

// Upgrade path: maps current plan to next tier with concrete advantages and SCALE jumps.
// Philosophy: Full Access. We never lock features — we boost capacity, credits, and reach.
// Tier ladder: breakthrough -> power -> victory. Victory returns null (top tier).
export const getDemoUpgradePath = (candidateId?: DemoCandidateId | null) => {
  const billing = getDemoBilling(candidateId);
  const slug = billing.plan.slug;
  if (slug === 'victory') return null;

  if (slug === 'breakthrough') {
    return {
      currentName: KALPIZ_PLANS.breakthrough.name,
      currentSlug: 'breakthrough' as const,
      currentMonthly: KALPIZ_PLANS.breakthrough.monthly,
      currentMandates: KALPIZ_PLANS.breakthrough.mandates,
      nextSlug: 'power' as const,
      nextName: KALPIZ_PLANS.power.name,
      nextMonthly: KALPIZ_PLANS.power.monthly,
      nextMandates: KALPIZ_PLANS.power.mandates,
      tagline: 'הגבר את עוצמת הקמפיין: יותר קרדיטים, יותר טווח, יותר מהירות',
      advantages: [
        { label: 'תמיכת WhatsApp בעדיפות גבוהה', icon: 'phone' as const },
        { label: 'מנהל הצלחת לקוח שבועי', icon: 'crown' as const },
        { label: 'משתמשי CRM מורחבים (5 מושבי מפקח)', icon: 'users' as const },
        { label: 'עיבוד AI מהיר פי 2', icon: 'rocket' as const },
        { label: 'ערוצי שידור מקבילים: 3 במקום 2', icon: 'sparkles' as const },
      ],
      // Scale-based comparison: every metric is QUANTITY, not feature-gating.
      scale: {
        whatsapp: { current: 10_000, next: 30_000, unit: 'הודעות / חודש' },
        sms: { current: 5_000, next: 15_000, unit: 'הודעות / חודש' },
        voice: { current: 500, next: 2_000, unit: 'דקות / חודש' },
        ai_touchpoints: { current: 50_000, next: 200_000, unit: 'אינטראקציות / חודש' },
        reach: { current: 5_000, next: 50_000, unit: 'בוחרים פעילים' },
        channels: { current: 2, next: 3, unit: 'ערוצי שידור מקבילים' },
        ai_speed: { current: 1, next: 2, unit: 'מהירות עיבוד AI (פי)' },
      },
    };
  }

  // power -> victory
  return {
    currentName: KALPIZ_PLANS.power.name,
    currentSlug: 'power' as const,
    currentMonthly: KALPIZ_PLANS.power.monthly,
    currentMandates: KALPIZ_PLANS.power.mandates,
    nextSlug: 'victory' as const,
    nextName: KALPIZ_PLANS.victory.name,
    nextMonthly: KALPIZ_PLANS.victory.monthly,
    nextMandates: KALPIZ_PLANS.victory.mandates,
    tagline: 'תדלק את המנוע לקמפיין ארצי: כוח אש מקסימלי בכל הערוצים',
    advantages: [
      { label: 'מנהל הצלחת לקוח ייעודי 24/7', icon: 'crown' as const },
      { label: 'מושבי מפקח ללא הגבלה', icon: 'users' as const },
      { label: 'עיבוד AI בעדיפות עליונה (פי 4)', icon: 'rocket' as const },
      { label: 'ערוצי שידור מקבילים ללא הגבלה', icon: 'sparkles' as const },
      { label: 'יועץ אסטרטגי בכיר זמין יומית', icon: 'bot' as const },
    ],
    scale: {
      whatsapp: { current: 30_000, next: 120_000, unit: 'הודעות / חודש' },
      sms: { current: 15_000, next: 60_000, unit: 'הודעות / חודש' },
      voice: { current: 2_000, next: 10_000, unit: 'דקות / חודש' },
      ai_touchpoints: { current: 200_000, next: 1_000_000, unit: 'אינטראקציות / חודש' },
      reach: { current: 50_000, next: 250_000, unit: 'בוחרים פעילים' },
      channels: { current: 3, next: 99, unit: 'ערוצי שידור מקבילים' },
      ai_speed: { current: 2, next: 4, unit: 'מהירות עיבוד AI (פי)' },
    },
  };
};

export const getDemoCandidateVoters = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const isPrimaries = candidate.electionType === 'primaries';
  const scaleBoost = candidate.scale === 'large' ? 12 : candidate.scale === 'medium' ? 6 : 2;
  return DEMO_VOTERS.map((voter, index) => ({
    ...voter,
    interest_tag: candidate.focus[index % candidate.focus.length],
    engagement_score: Math.min(99, (voter.engagement_score ?? 40) + scaleBoost + (index % 9)),
    interest_scores: {
      ...voter.interest_scores,
      // Primaries voters skew toward party loyalty / activism;
      // national-large skews toward governance & economy.
      security: candidate.scale === 'large' ? 88 : voter.interest_scores.security,
      economy: candidate.scale !== 'small' ? 90 : voter.interest_scores.economy,
      social: isPrimaries ? 86 : voter.interest_scores.social,
    },
    interest_score_json: {
      ...voter.interest_score_json,
      governance: candidate.scale === 'large' ? 92 : voter.interest_score_json.governance,
    },
  }));
};

export const getDemoCandidateMessages = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  return DEMO_MESSAGES.map((message, index) => ({
    ...message,
    content: index % 5 === 0
      ? `${message.content} הדגש של המועמד: ${candidate.focus[index % candidate.focus.length]}.`
      : message.content,
  }));
};

export const getDemoCandidateKnowledgeDocuments = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  return [
    { id: `demo-kb-${candidate.id}-1`, title: `ספר מסרים - ${candidate.name}`, source_type: 'upload', chunk_count: 96 + candidate.mandateGoal, created_at: recentTimestamp(30) },
    { id: `demo-kb-${candidate.id}-2`, title: `מודיעין שטח: ${candidate.focus.join(' · ')}`, source_type: 'whatsapp', chunk_count: 118 + candidate.mandateGoal * 2, created_at: recentTimestamp(75) },
    { id: `demo-kb-${candidate.id}-3`, title: `תרחיש משבר: ${candidate.crisis}`, source_type: 'upload', chunk_count: 54 + candidate.mandateGoal, created_at: recentTimestamp(180) },
  ];
};

export const getDemoCandidateSurveyInsights = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  return [{
    id: `demo-survey-${candidate.id}`,
    title: 'סקר שטח - [שם המועמד]',
    summary: `${candidate.focus.join(' ו־')} מובילים את הסנטימנט; תרחיש המשבר המרכזי: ${candidate.crisis}.`,
    row_count: 1240 + candidate.mandateGoal * 73,
    created_at: recentTimestamp(55),
    top_concerns: candidate.focus.map((label) => ({ label })),
    weak_points: [candidate.crisis],
    swing_voters: [{ segment: candidate.electionType === 'primaries' ? 'פעילי פריימריז מתלבטים' : 'מתלבטים ארציים', count: 180 + candidate.mandateGoal * 18 }],
    message_recommendations: [{ area: 'ארצי', script: `שלום {{שם}}, [שם המועמד] מציג/ה קו ברור סביב ${candidate.focus[0]} - נשמח לשמוע מה חשוב לך.` }],
    sentiment_by_area: [],
    user_id: 'demo',
    updated_at: recentTimestamp(20),
  }];
};

export const getDemoCandidateCrisisAlerts = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  return [{
    id: `demo-crisis-${candidate.id}`,
    title: `התראת משבר: ${candidate.crisis}`,
    summary: `זוהתה עלייה בשיח שלילי סביב ${candidate.crisis}. מומלץ להגיב במסר קצר, עובדתי ולא מתגונן.`,
    severity: 'critical',
    affected_topic: candidate.focus[0],
    affected_segment: candidate.electionType === 'primaries' ? 'פעילי פריימריז' : 'מתלבטים ארציים',
    response_options: {
      fighter: 'תגובה חדה בשם [שם המועמד]: הטענה לא מדויקת - הנה העובדות והמספרים.',
      statesman: `תגובה ממלכתית: מבינים את החשש, מציגים תוכנית ברורה סביב ${candidate.focus[0]}.`,
      ignorer: 'ניטור והסתרה נקודתית של בוטים, בלי להגדיל חשיפה לשיח לא אותנטי.',
    },
  }];
};

export const getDemoApprovalQueue = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  const focus = candidate.focus[0] || 'הקמפיין';
  const focus2 = candidate.focus[1] || focus;
  return [
    {
      id: `demo-aq-1-${candidate.id}`,
      title: `הודעת WhatsApp לקבוצת מתלבטים - ${focus}`,
      platform: 'whatsapp',
      content_type: 'outbound_message',
      proposed_content: `שלום [שם],\nראינו שאתה עוקב אחרי הדיון סביב ${focus}. רצינו לשתף עמדה קצרה וברורה של ${candidate.name}: אנחנו לא מתחמקים - יש תוכנית, יש לוחות זמנים, ויש נכונות לדבר ישירות. נשמח לשמוע מה הכי חשוב לך.`,
      edited_content: null,
      status: 'pending',
      confidence_score: 88,
      low_confidence_reason: null,
      target_voter_id: null,
      target_label: 'מתלבטים - מחוז מרכז (1,240)',
      source_citations: [{ title: `מצע ${candidate.name} - ${focus}` }, { title: 'סקר פנימי 04/26' }],
      live_post_url: null,
      created_at: minutesAgo(7),
    },
    {
      id: `demo-aq-2-${candidate.id}`,
      title: `פוסט פייסבוק - תגובה לכותרת בתקשורת`,
      platform: 'facebook',
      content_type: 'social_post',
      proposed_content: `הכותרת הבוקר על ${focus2} מטעה. הנה העובדות, בלי רעש:\n• ${candidate.name} הציע/ה תוכנית מפורטת לפני 3 חודשים.\n• היא כוללת לוחות זמנים, מקורות תקציב ופיקוח חיצוני.\n• אנחנו ממשיכים לעבוד - לא להתלונן.`,
      edited_content: null,
      status: 'pending',
      confidence_score: 64,
      low_confidence_reason: 'הטון עלול להיתפס כתוקפני מדי לפלח של מתלבטים.',
      target_voter_id: null,
      target_label: 'עוקבי דף - כלל הציבור',
      source_citations: [{ title: 'מאמר תגובה - ynet' }],
      live_post_url: null,
      created_at: minutesAgo(22),
    },
    {
      id: `demo-aq-3-${candidate.id}`,
      title: `סטורי אינסטגרם - סרטון 30 שניות`,
      platform: 'instagram',
      content_type: 'social_post',
      proposed_content: `30 שניות, בלי פילטרים: למה ${focus} זה לא רק סיסמה אצלנו. שלוש פעולות שביצענו החודש, ושלוש שנעשה עד סוף הקיץ.`,
      edited_content: null,
      status: 'approved',
      confidence_score: 92,
      low_confidence_reason: null,
      target_voter_id: null,
      target_label: 'עוקבים גילאי 18-34',
      source_citations: [],
      live_post_url: null,
      created_at: minutesAgo(95),
    },
    {
      id: `demo-aq-4-${candidate.id}`,
      title: `SMS תזכורת - אירוע שטח ביום ה'`,
      platform: 'sms',
      content_type: 'outbound_message',
      proposed_content: `${candidate.name} בשטח ביום ה' ב-19:00, רחוב הרצל 14. בלי במה, בלי מתווכים - שיחה ישירה. מאשרים הגעה?`,
      edited_content: null,
      status: 'posted',
      confidence_score: 95,
      low_confidence_reason: null,
      target_voter_id: null,
      target_label: 'הצבעה רכה - מחוז צפון (840)',
      source_citations: [],
      live_post_url: null,
      created_at: minutesAgo(420),
    },
    {
      id: `demo-aq-5-${candidate.id}`,
      title: `תגובה לפוסט ב-X - אזכור שלילי`,
      platform: 'x',
      content_type: 'social_post',
      proposed_content: `אנחנו לא מתעלמים מביקורת. הנה התשובה שלנו, עם נתונים - בלי רעש ובלי האשמות אישיות.`,
      edited_content: null,
      status: 'rejected',
      confidence_score: 41,
      low_confidence_reason: 'סבירות גבוהה להתלקחות שיח, מומלץ לא להגיב.',
      target_voter_id: null,
      target_label: 'אזכור פומבי',
      source_citations: [],
      live_post_url: null,
      created_at: minutesAgo(720),
    },
  ];
};

export const getDemoMetaAdCampaigns = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const focus = candidate.focus[0] || 'הקמפיין';
  const focus2 = candidate.focus[1] || focus;
  return [
    {
      id: `demo-meta-1-${candidate.id}`,
      name: `${focus} - מתלבטים מרכז`,
      status: 'active',
      audience_type: 'swing',
      daily_budget: 350,
      created_at: recentTimestamp(2),
      metrics: { spend: 4_280, engagements: 12_450, cpa: 3.4, roas: 0 },
      creative_variants: [
        { headline: 'מקשיבים. פועלים. מנצחים.', primary_text: `מסר ממוקד למתלבטים סביב ${focus}.` },
        { headline: 'הקול שלך הופך להשפעה', primary_text: 'פנייה רגשית קצרה.' },
        { headline: 'תוכנית מעשית לשינוי אמיתי', primary_text: 'מסר מבוסס נתונים.' },
      ],
    },
    {
      id: `demo-meta-2-${candidate.id}`,
      name: `${candidate.name} - תומכים פעילים`,
      status: 'active',
      audience_type: 'supporters',
      daily_budget: 220,
      created_at: recentTimestamp(7),
      metrics: { spend: 6_910, engagements: 21_800, cpa: 2.1, roas: 0 },
      creative_variants: [
        { headline: `${focus2} זה לא סיסמה`, primary_text: 'שלוש פעולות שעשינו החודש.' },
        { headline: 'בלי במה, בלי מתווכים', primary_text: 'שיחה ישירה איתכם.' },
        { headline: 'גייסו חבר/ה', primary_text: 'הקריאה לפעולה לתומכים.' },
      ],
    },
    {
      id: `demo-meta-3-${candidate.id}`,
      name: `אזעקה - תגובה לכותרת ${focus2}`,
      status: 'paused',
      audience_type: 'exclude_opponents',
      daily_budget: 120,
      created_at: recentTimestamp(12),
      metrics: { spend: 1_540, engagements: 4_120, cpa: 4.8, roas: 0 },
      creative_variants: [
        { headline: 'העובדות, בלי רעש', primary_text: 'תגובה ענייניית לכותרת בתקשורת.' },
        { headline: 'אנחנו ממשיכים לעבוד', primary_text: 'לא להתלונן - לעשות.' },
        { headline: 'מסמך מלא בפנים', primary_text: 'קישור למסמך עמדה.' },
      ],
    },
  ];
};

export const getDemoCampaigns = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const focus = candidate.focus[0] || 'הקמפיין';
  const focus2 = candidate.focus[1] || focus;
  return [
    {
      id: `demo-camp-1-${candidate.id}`,
      name: `WhatsApp Drip - ${focus}`,
      description: `סדרת 3 הודעות ממוקדות בנושא ${focus} למתלבטים`,
      status: 'active',
      total_sent: 12_400,
      total_clicks: 3_980,
      tag_associated: focus,
      sms_body: `שלום [שם], רצינו לשתף עמדה קצרה של ${candidate.name} בנושא ${focus}.`,
      created_at: recentTimestamp(3),
    },
    {
      id: `demo-camp-2-${candidate.id}`,
      name: `SMS תזכורת אירוע - ${focus2}`,
      description: `הזמנה לאירוע שטח בנושא ${focus2}`,
      status: 'completed',
      total_sent: 8_200,
      total_clicks: 1_640,
      tag_associated: focus2,
      sms_body: `${candidate.name} בשטח ביום ה' ב-19:00. מאשרים הגעה?`,
      created_at: recentTimestamp(14),
    },
    {
      id: `demo-camp-3-${candidate.id}`,
      name: `מבצע גיוס תומכים`,
      description: 'קמפיין רב-ערוצי לגיוס תומכים פעילים',
      status: 'active',
      total_sent: 22_600,
      total_clicks: 7_120,
      tag_associated: 'תומכים',
      sms_body: `הצטרפו אלינו - כל קול חשוב לקמפיין של ${candidate.name}.`,
      created_at: recentTimestamp(21),
    },
    {
      id: `demo-camp-4-${candidate.id}`,
      name: `סקר עמדות - ${focus}`,
      description: 'סקר קצר למיפוי עמדות',
      status: 'completed',
      total_sent: 15_800,
      total_clicks: 4_200,
      tag_associated: 'סקר',
      sms_body: `דעתך חשובה לנו - סקר קצר של 2 דקות.`,
      created_at: recentTimestamp(35),
    },
  ];
};

export const getDemoTrackingLinks = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  return candidate.focus.slice(0, 3).map((tag, i) => ({
    id: `demo-link-${candidate.id}-${i}`,
    short_code: `K${(candidate.id.charCodeAt(0) + i).toString(36).toUpperCase()}${i}X${(i + 3) * 7}`,
    target_url: `https://${candidate.id}.kalpiz.co.il/${encodeURIComponent(tag)}`,
    tag,
    click_count: 1_200 + i * 480,
    created_at: recentTimestamp(2 + i * 5),
  }));
};

// ── Conversation Analytics demo dataset ──
// Per-archetype activityMetrics, topicCloud, volumeSentimentData & aiInsights.
export const getDemoConversationAnalytics = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const focus = candidate.focus;

  return {
    activityMetrics: [
      { key: 'analyzed', label: 'סה"כ שיחות שנותחו', value: '4,829', subtext: 'WhatsApp, SMS, תמלולים' },
      { key: 'response', label: 'זמן מענה ממוצע (AI)', value: '1.2 שניות', subtext: 'תגובה כמעט מיידית' },
      { key: 'conversion', label: 'אחוז המרה/הסכמה', value: '68%', subtext: 'הסכמה, תמיכה או המשך שיחה' },
    ],
    topicCloud: [
      { label: focus[0] ?? 'ביטחון אישי', size: 'text-2xl sm:text-3xl', weight: 'font-black' },
      { label: focus[1] ?? 'חינוך', size: 'text-lg sm:text-xl', weight: 'font-bold' },
      { label: focus[2] ?? 'מחירי הדיור', size: 'text-2xl sm:text-3xl', weight: 'font-black' },
      { label: focus[3] ?? 'תחבורה ציבורית', size: 'text-sm', weight: 'font-semibold' },
      { label: 'אחדות', size: 'text-lg sm:text-xl', weight: 'font-bold' },
    ],
    volumeSentimentData: [
      { time: '08:00', conversations: 240, sentiment: 72 },
      { time: '10:00', conversations: 380, sentiment: 75 },
      { time: '12:00', conversations: 520, sentiment: 70 },
      { time: '14:00', conversations: 610, sentiment: 64 },
      { time: '16:00', conversations: 760, sentiment: 48, event: 'Crisis' },
      { time: '18:00', conversations: 1180, sentiment: 57 },
      { time: '20:00', conversations: 1340, sentiment: 69 },
      { time: '22:00', conversations: 890, sentiment: 74 },
    ],
    aiInsights: [
      `עליה של 22% בשיח על ${focus[0] ?? 'ביטחון'} בשכונות דרום העיר - מומלץ לתגבר נוכחות דיגיטלית שם.`,
      `הבוחרים מגיבים בחיוב למסרים של אחדות בקמפיין של ${candidate.name} (סנטימנט 74%+).`,
      `זוהתה התנגדות סביב נושא ${focus[1] ?? 'המיסוי המקומי'} - מומלץ לעדכן את דף המסרים (Knowledge Base).`,
    ],
    sampleConversations: [
      { source: 'WhatsApp', status: 'הועבר לטיפול', snippet: `רציתי לדעת מה עמדת ${candidate.name} לגבי ${focus[0] ?? 'ביטחון אישי'} בשכונה...` },
      { source: 'SMS', status: 'הושלם ע"י AI', snippet: 'תודה על המידע, אני תומך!' },
      { source: 'Transcript', status: 'דורש בדיקה', snippet: `הארנונה עלתה שוב, מה אתם מתכוונים לעשות בנושא?` },
      { source: 'WhatsApp', status: 'הושלם ע"י AI', snippet: `חשוב לי לשמוע על תוכנית ${focus[1] ?? 'החינוך'} לפני שאחליט.` },
    ],
  };
};
