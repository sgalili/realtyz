// ── High-density demo mock data for Realtyz AI ──

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
    'ביקוש חזק במרכז: תל אביב וראשון לציון מציגות עלייה של 12% בפניות למכירה החודש. ירושלים בולטת בשוק ההשכרות עם פוטנציאל גבוה. בחיפה מומלץ לחזק נוכחות בנכסים יד שנייה, ובדרום שוק ההשכרות לסטודנטים תוסס.',
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
  { id: '1', name: 'גיוס לידים – דירות 3 חדרים תל אביב', description: 'דיוור לקונים פוטנציאליים בת״א', status: 'active', total_sent: 45_200, total_clicks: 12_800, created_at: '2025-01-15' },
  { id: '2', name: 'שכירות סטודנטים – ירושלים', description: 'מבצע השכרות לקראת תחילת שנה', status: 'completed', total_sent: 120_000, total_clicks: 38_400, created_at: '2024-12-01' },
  { id: '3', name: 'יד שנייה – ראשון לציון', description: 'נכסים יד שנייה לזוגות צעירים', status: 'active', total_sent: 28_600, total_clicks: 9_100, created_at: '2025-02-10' },
  { id: '4', name: 'משקיעים – נדל"ן מניב בירושלים', description: 'הזדמנויות השקעה לנכסים מניבים', status: 'paused', total_sent: 65_000, total_clicks: 18_200, created_at: '2024-11-20' },
  { id: '5', name: 'השכרת דירות – חיפה', description: 'דירות להשכרה בחיפה והקריות', status: 'completed', total_sent: 32_000, total_clicks: 11_500, created_at: '2024-10-05' },
  { id: '6', name: 'נכסים חדשים מקבלן – נגב', description: 'פרויקטים מקבלן לזכאי משכנתא', status: 'completed', total_sent: 88_000, total_clicks: 22_000, created_at: '2024-09-15' },
  { id: '7', name: 'פנטהאוזים תל אביב', description: 'נכסי יוקרה במגדלי המרכז', status: 'active', total_sent: 150_000, total_clicks: 47_000, created_at: '2025-03-01' },
  { id: '8', name: 'בית פרטי – פתח תקווה', description: 'בתים פרטיים למשפחות', status: 'completed', total_sent: 72_000, total_clicks: 19_800, created_at: '2024-08-22' },
  { id: '9', name: 'דירת 2 חדרים להשכרה – רמת גן', description: 'מתאים לזוגות צעירים', status: 'active', total_sent: 55_000, total_clicks: 21_300, created_at: '2025-01-28' },
  { id: '10', name: 'דירות גן – הרצליה', description: 'דירות גן עם חצר פרטית', status: 'completed', total_sent: 40_000, total_clicks: 8_200, created_at: '2024-07-10' },
  { id: '11', name: 'משפר דיור – נתניה', description: 'מעבר מ-3 ל-4 חדרים', status: 'completed', total_sent: 95_000, total_clicks: 31_200, created_at: '2024-06-18' },
  { id: '12', name: 'נכסים מסחריים – צפון', description: 'משרדים וחנויות', status: 'paused', total_sent: 48_000, total_clicks: 14_100, created_at: '2024-11-05' },
  { id: '13', name: 'דירות חדשות מקבלן – אשדוד', description: 'מבצע אכלוס ראשון', status: 'active', total_sent: 62_000, total_clicks: 18_900, created_at: '2025-02-20' },
  { id: '14', name: 'דירות יד שנייה – באר שבע', description: 'נכסים מוכנים לאכלוס מיידי', status: 'completed', total_sent: 110_000, total_clicks: 35_600, created_at: '2024-05-30' },
  { id: '15', name: 'יום נדל"ן פתוח – אזור המרכז', description: 'תיאום סיורים בנכסים זמינים', status: 'scheduled', total_sent: 0, total_clicks: 0, created_at: '2025-04-10' },
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

// Deep real-estate conversations for first 5 leads (Sale & Rent split, agent = Udi).
// Each lead is locked to ONE pipeline (sale | rent) — no cross-pipeline messaging.
const deepConversations: Record<number, Array<{ role: 'ai' | 'lead'; content: string; month: number }>> = {
  0: [ // דני כהן — תל אביב — Sale · 3-room apartment (canonical Dan/Udi flow)
    { role: 'ai', content: 'היי דני, אני אודי. ראיתי את הפנייה שלך לגבי דירת 3 חדרים בתל אביב. בחירה מצוינת, ביקוש גבוה מאוד באזור. מחפש לקנות או לשכור?', month: 0 },
    { role: 'lead', content: 'מחפש לקנות. המחיר גמיש?', month: 0 },
    { role: 'ai', content: 'המחיר הוא 4,500,000 ₪. תמחור תחרותי לאזור. רוצה לבוא לראות את הדירה ביום שלישי בשעה 17:00?', month: 1 },
    { role: 'lead', content: 'כן, מתאים לי.', month: 1 },
    { role: 'ai', content: 'מצוין, קבעתי את הסיור ליום שלישי 17:00. שולח לך תיכף את ה-Pin של המיקום. נתראה!', month: 1 },
  ],
  1: [ // מיכאל לוי — ראשון לציון — Sale · 4-room למשפחה
    { role: 'ai', content: 'שלום מיכאל, אני אודי. ראיתי שאתם מחפשים 4 חדרים בראשון לציון. יש לי שני נכסים שעלולים להתאים בדיוק. למשפחה?', month: 0 },
    { role: 'lead', content: 'כן, אנחנו עם שני ילדים. תקציב עד 2.6 מיליון ש״ח.', month: 0 },
    { role: 'ai', content: 'מעולה. יש לי דירה בשכונת הרקפות, 4 חדרים, קומה 3 עם מעלית, 2.45 מיליון ש״ח. שמורה לכם?', month: 1 },
    { role: 'lead', content: 'נשמע טוב. יש חניה?', month: 1 },
    { role: 'ai', content: 'כן, חניה תת-קרקעית פרטית ומחסן. רוצה שאקבע סיור לסוף השבוע?', month: 2 },
    { role: 'lead', content: 'כן, יום שישי בבוקר אם אפשר.', month: 2 },
    { role: 'ai', content: 'נקבע ליום שישי 10:00. אשלח לך מצגת עם תמונות ותוכנית הדירה עוד היום.', month: 3 },
  ],
  2: [ // אורי שמיר — תל אביב — Rent · דירת 2 חדרים
    { role: 'ai', content: 'היי אורי, אני אודי. ראיתי שאתה מחפש 2 חדרים להשכרה במרכז ת״א. מאיזה תאריך?', month: 0 },
    { role: 'lead', content: 'מ-1 לחודש הבא. תקציב עד 6,500 ש״ח.', month: 0 },
    { role: 'ai', content: 'יש לי דירה ברחוב בן יהודה, 2 חדרים, קומה 4 עם מעלית, מרוהטת חלקית — 6,200 ש״ח. רוצה לראות?', month: 1 },
    { role: 'lead', content: 'מעולה. מתי אפשר לבוא?', month: 1 },
    { role: 'ai', content: 'מחר בערב 18:30 מתאים? אקח אותך גם לדירה דומה ברוטשילד למקרה שתעדיף.', month: 2 },
    { role: 'lead', content: 'מושלם, נתראה מחר.', month: 2 },
    { role: 'ai', content: 'נהדר. שולח Pin ל-Waze. אם תאהב — אפשר לסגור חוזה כבר השבוע.', month: 3 },
  ],
  3: [ // נועם ברק — חיפה — Sale · משקיע בנכס מניב
    { role: 'ai', content: 'שלום נועם, אני אודי. ראיתי שאתה מתעניין בנכסים מניבים בחיפה. כבר יש לך תיק או זו השקעה ראשונה?', month: 0 },
    { role: 'lead', content: 'תיק קטן — 2 דירות בקריות. רוצה משהו עם תשואה טובה.', month: 0 },
    { role: 'ai', content: 'יש לי דירת 3 חדרים בהדר משופצת, מושכרת ב-3,800 ש״ח, נמכרת ב-1.05 מיליון. תשואה ~4.3%.', month: 1 },
    { role: 'lead', content: 'מעניין. מה לגבי הוצאות ועד וארנונה?', month: 1 },
    { role: 'ai', content: 'ועד 180 ש״ח לחודש, ארנונה ~620 בחודשיים. שולח לך גיליון תשואה נטו מלא.', month: 2 },
    { role: 'lead', content: 'תקבע לי סיור בשבוע הבא?', month: 3 },
    { role: 'ai', content: 'יום שני 11:00 בבוקר. אקח אותך גם לעוד נכס דומה ברחוב מסדה לשם השוואה.', month: 4 },
  ],
  4: [ // יוספה אברהם — באר שבע — Rent · סטודנטים
    { role: 'ai', content: 'היי יוספה, אני אודי. ראיתי שאת מחפשת דירת שותפים ליד אוניברסיטת בן גוריון.', month: 0 },
    { role: 'lead', content: 'כן, מ-1 לאוקטובר. עד 1,800 ש״ח לחדר.', month: 0 },
    { role: 'ai', content: 'יש לי 4 חדרים בשכונת ד׳, חדר פרטי 1,650 ש״ח, כולל אינטרנט. שותפות נחמדות.', month: 1 },
    { role: 'lead', content: 'נשמע טוב. אפשר לבוא לראות?', month: 2 },
    { role: 'ai', content: 'יום רביעי 17:00? אגיע איתך ונפגוש גם את הבנות שגרות שם.', month: 2 },
  ],
};

// Shorter real-estate flows for leads 5-11 (Sale or Rent — never mixed).
const shortConversations: Record<number, Array<{ role: 'ai' | 'lead'; content: string; month: number }>> = {
  5: [ // רונית — נתניה — Sale · משפר דיור
    { role: 'ai', content: 'היי רונית, אני אודי. ראיתי שאתם מחפשים לעבור מ-3 ל-4 חדרים בנתניה.', month: 0 },
    { role: 'lead', content: 'נכון, התקציב שלנו עד 2.3 מיליון ש״ח.', month: 0 },
    { role: 'ai', content: 'יש לי 4 חדרים בעיר ימים, קומה 6 עם נוף לים, 2.25 מיליון. רוצה לראות בסוף השבוע?', month: 1 },
    { role: 'lead', content: 'כן, שלח פרטים.', month: 1 },
  ],
  6: [ // אלון — פתח תקווה — Rent · דירת משפחה
    { role: 'ai', content: 'שלום אלון, אני אודי. דירה להשכרה בפ״ת, 4 חדרים, נכון?', month: 0 },
    { role: 'lead', content: 'כן, עד 7,500 לחודש, צריך לפחות 100 מ״ר.', month: 0 },
    { role: 'ai', content: 'יש לי דירה ברחוב ההגנה, 4 חדרים, 105 מ״ר, חניה — 7,300 ש״ח. אפשר לסייר מחר ב-18:00.', month: 1 },
  ],
  7: [ // שמעון — אשדוד — Sale · קבלן
    { role: 'ai', content: 'היי שמעון, אני אודי. ראיתי שאתה מתעניין בפרויקט החדש מקבלן באשדוד.', month: 0 },
    { role: 'lead', content: 'כן, 3 חדרים. יש זכאות משכנתא לזכאים?', month: 0 },
    { role: 'ai', content: 'יש מסלול לזכאי משרד השיכון, מחיר החל מ-1.69 מיליון. אשלח לך מסמך מלא.', month: 1 },
    { role: 'lead', content: 'תודה, אקרא ואחזור אליך.', month: 2 },
  ],
  8: [ // עדי — תל אביב — Rent · סטודיו
    { role: 'ai', content: 'היי עדי, אני אודי. סטודיו במרכז ת״א, נכון?', month: 0 },
    { role: 'lead', content: 'כן, עד 4,800 ש״ח. מ-15 בחודש.', month: 0 },
    { role: 'ai', content: 'יש לי סטודיו ברחוב אלנבי, 30 מ״ר, מרוהט מלא — 4,650 ש״ח. רוצה לבוא היום?', month: 1 },
  ],
  9: [ // הדר — ירושלים — Sale · 4 חדרים
    { role: 'ai', content: 'שלום הדר, אני אודי. 4 חדרים בקטמון, נכון?', month: 0 },
    { role: 'lead', content: 'כן, עד 3.1 מיליון. שמור עליי אם משהו נכנס.', month: 0 },
    { role: 'ai', content: 'יש לי דירה משופצת ברחוב המ״ג, 105 מ״ר, מרפסת שמש, 2.95 מיליון. סיור ביום שלישי?', month: 1 },
  ],
  10: [
    { role: 'ai', content: 'היי גל, אני אודי. ראיתי בקשה ל-5 חדרים בגבעתיים — Sale.', month: 0 },
    { role: 'lead', content: 'נכון, עד 4 מיליון. רוצים מעלית וחניה.', month: 0 },
    { role: 'ai', content: 'יש לי דירה בשיכון בורוכוב, 5 חדרים, 2 חניות, מעלית, 3.85 מיליון. שולח עכשיו תמונות.', month: 1 },
  ],
  11: [
    { role: 'ai', content: 'שלום יעל, אני אודי. השכרה בהרצליה — 3 חדרים, נכון?', month: 0 },
    { role: 'lead', content: 'כן, מחפשת קרוב למרכז העיר. עד 7,000 ש״ח.', month: 0 },
    { role: 'ai', content: 'יש לי דירה בשכונת יד התשעה, 3 חדרים, מרפסת — 6,800 ש״ח. רוצה לראות מחר?', month: 1 },
  ],
};

const months = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'];
const demoChannels = ['whatsapp', 'instagram', 'messenger', 'tiktok', 'signal', 'x', 'facebook', 'sms'] as const;
// Real-estate omni follow-ups. Indexed by lead position; even = sale pipeline,
// odd = rent pipeline. Pipelines never cross.
const demoInteractionScenarios = [
  ['ראיתי את המודעה לדירת 3 חדרים. עוד פנויה?', 'כן, פנויה. שולח לך עכשיו תמונות נוספות ותוכנית הדירה. רוצה לסייר השבוע?'],
  ['המחיר שכתוב בלוח עדכני?', 'מעודכן להיום. יש מקום קטן למשא ומתן בתום הסיור — תלוי בלוחות זמנים שלך.'],
  ['חיפשתי דירה להשכרה — מה הזמינות מ-1 לחודש?', 'יש לי שתי דירות שמתפנות בדיוק בתאריך הזה. אסכם לך אותן ב-WhatsApp.'],
  ['אני צריך לקנות תוך 3 חודשים. ריאלי?', 'בהחלט ריאלי. בוא נסגור פגישת אפיון של 20 דק׳ ואחזור עם 3 נכסים מדויקים.'],
  ['יש חניה ומחסן בנכס?', 'יש חניה תת-קרקעית פרטית ומחסן 6 מ״ר. אצרף את שטר הרישום בטאבו.'],
  ['רציתי לדעת על משכנתא — אתה עוזר עם זה?', 'יש לי יועצת משכנתאות שאני עובד איתה — אקשר אתכם בלי עלות מצידך.'],
  ['ראיתי בלוח דירה דומה ב-200K פחות, איך אתה מסביר?', 'שאלה לגיטימית. ההבדל הוא קומה, מצב תחזוקה ושיפוץ. אשלח השוואה מסודרת של 3 נכסים.'],
  ['אפשר לתאם סיור לסוף השבוע?', 'כן — שישי 10:00 או שבת 18:00. מה עדיף לך? אאשר לבעלים מיד.'],
];

const buildOmniFollowUps = (index: number, name: string, city: string, topic: string) => {
  const [voterConcern, aiResponse] = demoInteractionScenarios[index % demoInteractionScenarios.length];
  const firstName = name.split(' ')[0];
  const primary = demoChannels[index % demoChannels.length];
  const secondary = demoChannels[(index + 3) % demoChannels.length];
  const tertiary = demoChannels[(index + 5) % demoChannels.length];
  const isSale = index % 2 === 0;
  const pipelineLabel = isSale ? 'נכסים למכירה' : 'דירות להשכרה';

  return [
    { role: 'lead' as const, channel: primary, content: voterConcern, month: 5 },
    { role: 'ai' as const, channel: secondary, content: `${firstName}, ${aiResponse}`, month: 5 },
    { role: 'lead' as const, channel: tertiary, content: index % 4 === 0 ? 'אוקיי, תמשיך לעדכן רק ב-WhatsApp בבקשה.' : `תודה. מעניין אותי גם ${pipelineLabel} ב${city}.`, month: 5 },
    { role: 'ai' as const, channel: demoChannels[(index + 7) % demoChannels.length], content: index % 5 === 0 ? 'מצוין. עדכנתי העדפת ערוץ, אעדכן אותך אישית כשייכנסו נכסים מתאימים.' : `קיבלתי. שמור על ${pipelineLabel} בלבד — אשלח רק נכסים שתואמים לפיילין שלך.`, month: 5 },
  ];
};

// Generate realistic recent timestamps for demo
function recentTimestamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const recentOffsets = Array.from({ length: 50 }, (_, i) => [2, 5, 9, 14, 22, 31, 44, 58, 76, 95, 130, 175, 240, 330, 480, 720, 980, 1440][i % 18] + Math.floor(i / 18) * 11); // minutes ago per lead

// Real-estate topics. `key` doubles as the dominant interest dimension.
// Even index → 'sale' pipeline, odd → 'rent'. Hard separation.
const demoTopics = [
  { tag: 'דירה למכירה', key: 'sale_apt',     listing_type: 'sale' as const, voter: 'מחפש לקנות 3 חדרים, עד 2.5 מיליון.', ai: 'מעולה. אאסוף 3 נכסים שמתאימים בדיוק ואשלח עוד היום.' },
  { tag: 'דירה להשכרה', key: 'rent_apt',     listing_type: 'rent' as const, voter: 'מחפש דירה להשכרה, מ-1 לחודש.', ai: 'יש לי כמה אפשרויות מדויקות לתאריך. שולח עכשיו.' },
  { tag: 'נכס מניב',    key: 'investment',   listing_type: 'sale' as const, voter: 'מחפש השקעה בתשואה 4%+ לשנה.', ai: 'אצרף 3 נכסים מניבים עם גיליון תשואה נטו מלא.' },
  { tag: 'שכירות סטודנטים', key: 'rent_student', listing_type: 'rent' as const, voter: 'דירת שותפים ליד האוניברסיטה.', ai: 'יש לי שתיים פנויות מאוקטובר. אקבע סיור.' },
  { tag: 'בית פרטי',    key: 'house_sale',   listing_type: 'sale' as const, voter: 'בית פרטי עם גינה למשפחה.', ai: 'מצוין. אאתר נכסים עם גינה לפי תקציב ויישוב.' },
];

const buildInterestScores = (index: number) => {
  const main = demoTopics[index % demoTopics.length].key;
  const scores = { sale_apt: 28 + ((index * 7) % 45), rent_apt: 24 + ((index * 11) % 48), investment: 18 + ((index * 13) % 42), rent_student: 20 + ((index * 17) % 44), house_sale: 22 + ((index * 19) % 46) } as Record<string, number>;
  scores[main] = 72 + ((index * 5) % 24);
  return scores;
};

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
    { role: 'lead' as const, content: fallbackTopic.voter, month: 0 },
    { role: 'ai' as const, content: fallbackTopic.ai, month: 1 },
    { role: 'lead' as const, content: index % 3 === 0 ? 'נשמע טוב, שלחו לי עוד פרטים ואשקול להצטרף.' : 'תודה, זה יותר ברור עכשיו.', month: 2 },
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
  id: `demo-lead-${i}`,
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
  instagram_handle: `realtyz_${i}`,
  telegram_username: `realtyz_voter_${i}`,
  messenger_id: `msgr-${i}`,
  tiktok_handle: `realtyz.tok.${i}`,
  signal_number: `+${`97250${String(1000000 + i * 111111).slice(0, 7)}`}`,
  x_handle: `realtyz_x_${i}`,
  facebook_id: `fb-${i}`,
  interest_tag: demoTopics[i % demoTopics.length].tag,
  interest_scores: buildInterestScores(i),
  interest_score_json: buildInterestScores(i),
  is_voted: i % 6 === 0,
  fts: null,
}));

export const DEMO_MESSAGES = demoNames.flatMap((name, i) =>
  generateDemoThread(name, `demo-lead-${i}`, i)
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
    shortLabel: 'נכס יחיד · פריימריז',
    mandateGoal: 1,
    electionType: 'primaries',
    scale: 'small',
    focus: ['פעילי מפלגה', 'מסר אישי', 'נוכחות בשטח'],
    crisis: 'תחרות חריפה על מקום ריאלי ברשימה',
    narrative: 'קמפיין פריימריז ממוקד פעילים: כל פעיל הוא קול קריטי, יתרון תחרותי במסר אישי וזמינות בשטח.',
  },
  {
    id: 'primary-slate',
    name: 'קבוצת נכסים בפריימריז',
    shortLabel: 'קבוצה / רשימה · פריימריז',
    mandateGoal: 4,
    electionType: 'primaries',
    scale: 'medium',
    focus: ['תיאום מסר', 'חלוקת אזורים', 'הצבעה משולבת'],
    crisis: 'ניהול תיאום פנימי בין נכסי הקבוצה',
    narrative: 'רשימה מתואמת של נכסים בפריימריז: דאטה משותפת, חלוקת מחוזות, וקריאות הצבעה כפולות לפעילים.',
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
    narrative: 'תנועה צעירה במרוץ ארצי: כל עסקה נמדד באלפי קולות; הדגש על שימור קהל הליבה והוכחת חיוניות.',
  },
  {
    id: 'national-mid',
    name: 'מפלגה בינונית',
    shortLabel: 'מפלגה בינונית · ארצי',
    mandateGoal: 12,
    electionType: 'national',
    scale: 'medium',
    focus: ['יוקר המחיה', 'ביטחון אישי', 'אחדות'],
    crisis: 'תחרות על לידים מתלבטים מול גוש שכן',
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
//  - National sales: ~40,000 valid votes per Knesset transaction.
//  - Primaries: ~200 registered party leads per "delegate" / realistic-spot signal.
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

  // Sentiment volume scales with the addressable universe, not just transactions.
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

// Realtyz global pricing (matches https://realtyz.co.il/pricing).
// Single source of truth for plan base + setup fee — keeps in-app numbers
// consistent with the public pricing list across demo + real modes.
export const REALTYZ_PLANS = {
  breakthrough: { slug: 'breakthrough', name: 'מסלול פריצה', monthly: 2999, mandates: 1 },
  power:        { slug: 'power',        name: 'מסלול עוצמה', monthly: 7999, mandates: 3 },
  victory:      { slug: 'victory',      name: 'מסלול ניצחון', monthly: 14999, mandates: 10 },
} as const;
export const REALTYZ_SETUP_FEE = 5000;

// Pick the recommended plan for a given asking price (matches calculator logic).
export const pickRealtyzPlan = (mandates: number) => {
  if (mandates >= REALTYZ_PLANS.victory.mandates) return REALTYZ_PLANS.victory;
  if (mandates >= REALTYZ_PLANS.power.mandates) return REALTYZ_PLANS.power;
  return REALTYZ_PLANS.breakthrough;
};

// Realistic billing snapshot for the currently-viewed demo profile.
// Anchored to the recommended Realtyz plan (base subscription + setup fee)
// plus variable usage by service — so all balance/spend numbers in the app
// reflect the public pricing list and the listing's asking price.
export const getDemoBilling = (candidateId?: DemoCandidateId | null) => {
  const candidate = getCandidate(candidateId);
  const isPrimaries = candidate.electionType === 'primaries';
  const targetVotes = isPrimaries
    ? candidate.mandateGoal * VOTES_PER_PRIMARY_DELEGATE
    : candidate.mandateGoal * VOTES_PER_NATIONAL_MANDATE;

  // Recommended plan from public pricing list (₪2,999 / ₪7,999 / ₪14,999).
  const plan = pickRealtyzPlan(candidate.mandateGoal);
  const planMonthly = plan.monthly;
  const setupFee = REALTYZ_SETUP_FEE;

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

// Build a realistic, story-driven transactions ledger for the selected demo listing.
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
      description: 'קמפיין קולי (הקלטת נכס) · 5,000 דקות @ 0.20 ₪',
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
    { label: 'ספק SMS פעיל', value: 'Realtyz', tone: 'ok' as const },
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
      currentName: REALTYZ_PLANS.breakthrough.name,
      currentSlug: 'breakthrough' as const,
      currentMonthly: REALTYZ_PLANS.breakthrough.monthly,
      currentMandates: REALTYZ_PLANS.breakthrough.mandates,
      nextSlug: 'power' as const,
      nextName: REALTYZ_PLANS.power.name,
      nextMonthly: REALTYZ_PLANS.power.monthly,
      nextMandates: REALTYZ_PLANS.power.mandates,
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
        reach: { current: 5_000, next: 50_000, unit: 'לידים פעילים' },
        channels: { current: 2, next: 3, unit: 'ערוצי שידור מקבילים' },
        ai_speed: { current: 1, next: 2, unit: 'מהירות עיבוד AI (פי)' },
      },
    };
  }

  // power -> victory
  return {
    currentName: REALTYZ_PLANS.power.name,
    currentSlug: 'power' as const,
    currentMonthly: REALTYZ_PLANS.power.monthly,
    currentMandates: REALTYZ_PLANS.power.mandates,
    nextSlug: 'victory' as const,
    nextName: REALTYZ_PLANS.victory.name,
    nextMonthly: REALTYZ_PLANS.victory.monthly,
    nextMandates: REALTYZ_PLANS.victory.mandates,
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
      reach: { current: 50_000, next: 250_000, unit: 'לידים פעילים' },
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
      // Primaries leads skew toward party loyalty / activism;
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
      ? `${message.content} הדגש של הנכס: ${candidate.focus[index % candidate.focus.length]}.`
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
    title: 'סקר שטח - [שם הנכס]',
    summary: `${candidate.focus.join(' ו־')} מובילים את הסנטימנט; תרחיש המשבר המרכזי: ${candidate.crisis}.`,
    row_count: 1240 + candidate.mandateGoal * 73,
    created_at: recentTimestamp(55),
    top_concerns: candidate.focus.map((label) => ({ label })),
    weak_points: [candidate.crisis],
    swing_voters: [{ segment: candidate.electionType === 'primaries' ? 'פעילי פריימריז מתלבטים' : 'מתלבטים ארציים', count: 180 + candidate.mandateGoal * 18 }],
    message_recommendations: [{ area: 'ארצי', script: `שלום {{שם}}, [שם הנכס] מציג/ה קו ברור סביב ${candidate.focus[0]} - נשמח לשמוע מה חשוב לך.` }],
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
      fighter: 'תגובה חדה בשם [שם הנכס]: הטענה לא מדויקת - הנה העובדות והמספרים.',
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
    target_url: `https://${candidate.id}.realtyz.co.il/${encodeURIComponent(tag)}`,
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
      `הלידים מגיבים בחיוב למסרים של אחדות בקמפיין של ${candidate.name} (סנטימנט 74%+).`,
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
