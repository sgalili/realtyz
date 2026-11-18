export type DemoType = 'broker' | 'marketing' | 'developer' | 'owner' | 'buyer' | 'affiliate';

export const DEMO_TYPES: { id: DemoType; label: string }[] = [
  { id: 'broker', label: 'מתווך' },
  { id: 'marketing', label: 'חברת שיווק נדל"ן' },
  { id: 'developer', label: 'יזם / חברת בנייה' },
  { id: 'owner', label: 'מוכר / משכיר פרטי' },
  { id: 'buyer', label: 'קונה / סוחר נכסים' },
  { id: 'affiliate', label: 'שותף בלבד' },
];

export const isDemoType = (v: string | undefined): v is DemoType => DEMO_TYPES.some((t) => t.id === v);

export interface DemoStat { label: string; base: number; perTick: number; suffix?: string }
export interface DemoRow { title: string; meta: string; status: string }
export interface DemoConfig { headline: string; subtitle: string; stats: DemoStat[]; tableTitle: string; rows: DemoRow[]; campaigns: DemoRow[]; showDevelopers: boolean }

const campaigns: DemoRow[] = [
  { title: 'רוטציה ל-48 קבוצות פייסבוק', meta: 'לפני 12 דק׳ · 1,240 צפיות', status: 'פעיל' },
  { title: 'WhatsApp רשמי ל-320 לידים', meta: 'אתמול · 41 תגובות', status: 'הושלם' },
  { title: 'פוסט מתוזמן לדף העסקי', meta: 'מחר 09:00', status: 'מתוזמן' },
  { title: 'שיחות IVR בקול ריטה', meta: 'לפני 3 ימים · 87 מענים', status: 'הושלם' },
];

export const DEMO_CONFIGS: Record<DemoType, DemoConfig> = {
  broker: {
    headline: 'ניהול נכסים ורשת שותפים', subtitle: 'כך נראה החשבון של מתווך פעיל בטוראף',
    stats: [{ label: 'צפיות היום', base: 3420, perTick: 3 }, { label: 'לידים מסוננים', base: 58, perTick: 0.2 }, { label: 'שותפים משווקים', base: 23, perTick: 0.03 }, { label: 'עמלות צפויות', base: 184000, perTick: 40, suffix: '₪' }],
    tableTitle: 'הנכסים שלי', rows: [
      { title: '4 חד׳ ברחוב הרצל, רמת גן', meta: '₪2,850,000 · 7 שותפים', status: 'מפורסם' },
      { title: '3 חד׳ בנווה צדק, תל אביב', meta: '₪8,900 לחודש · 4 שותפים', status: 'מפורסם' },
      { title: 'פנטהאוז, הרצליה פיתוח', meta: '₪6,400,000 · 12 שותפים', status: 'מפורסם' },
      { title: 'דירת גן, רעננה', meta: 'חסרות תמונות', status: 'טיוטה' },
    ], campaigns, showDevelopers: true,
  },
  marketing: {
    headline: 'היזמים והקמפיינים שלנו', subtitle: 'מבט של מנהל חברת שיווק על כל הלקוחות',
    stats: [{ label: 'יזמים פעילים', base: 14, perTick: 0.01 }, { label: 'פרויקטים בשיווק', base: 41, perTick: 0.02 }, { label: 'לידים החודש', base: 1290, perTick: 1.2 }, { label: 'קמפיינים רצים', base: 9, perTick: 0 }],
    tableTitle: 'קמפיינים לפי יזם', rows: [
      { title: 'מגדלי הים, בת ים', meta: '312 לידים · 18 פגישות', status: 'פעיל' },
      { title: 'פארק הדרים, נס ציונה', meta: '204 לידים · 11 פגישות', status: 'פעיל' },
      { title: 'שכונת האלה, בית שמש', meta: '96 לידים', status: 'מתוזמן' },
    ], campaigns, showDevelopers: true,
  },
  developer: {
    headline: 'ניהול פרויקטים ודירות', subtitle: 'כל הפרויקטים, הדירות והשותפים במקום אחד',
    stats: [{ label: 'דירות זמינות', base: 186, perTick: 0 }, { label: 'מתווכים משווקים', base: 67, perTick: 0.05 }, { label: 'פניות היום', base: 44, perTick: 0.15 }, { label: 'נמכרו ברבעון', base: 23, perTick: 0.005 }],
    tableTitle: 'הפרויקטים שלי', rows: [
      { title: 'מגדלי הים, בת ים', meta: '120 דירות · 38 זמינות', status: 'בשיווק' },
      { title: 'נווה אלון, חדרה', meta: '64 דירות · 22 זמינות', status: 'בשיווק' },
      { title: 'רמות הגליל, כרמיאל', meta: '48 דירות', status: 'טיוטה' },
    ], campaigns, showDevelopers: true,
  },
  owner: {
    headline: 'הנכס שלי בשיווק', subtitle: 'מוכר או משכיר פרטי שמקבל עזרה מכל רשת השותפים',
    stats: [{ label: 'צפיות במודעה', base: 812, perTick: 1 }, { label: 'פניות', base: 17, perTick: 0.05 }, { label: 'מתווכים שמשווקים', base: 6, perTick: 0.01 }, { label: 'סיורים שנקבעו', base: 4, perTick: 0 }],
    tableTitle: 'המודעות שלי', rows: [
      { title: '3 חד׳ ברחוב ביאליק, חולון', meta: '₪1,950,000 · 6 שותפים', status: 'מפורסם' },
      { title: 'יחידת דיור להשכרה', meta: '₪4,200 לחודש', status: 'מפורסם' },
    ], campaigns: campaigns.slice(0, 2), showDevelopers: false,
  },
  buyer: {
    headline: 'חיפוש נכסים חכם', subtitle: 'קונה או סוחר נכסים שמקבל התאמות בזמן אמת',
    stats: [{ label: 'נכסים מתאימים', base: 342, perTick: 0.3 }, { label: 'התאמות חדשות היום', base: 12, perTick: 0.05 }, { label: 'מועדפים', base: 19, perTick: 0 }, { label: 'פרויקטים חדשים', base: 28, perTick: 0.01 }],
    tableTitle: 'התאמות עבורי', rows: [
      { title: '4 חד׳ בגבעתיים', meta: '₪3,100,000 · התאמה 94%', status: 'חדש' },
      { title: 'דירה מקבלן, בת ים', meta: '₪2,450,000 · התאמה 88%', status: 'חדש' },
      { title: 'מגרש, קריית טבעון', meta: '₪1,800,000 · התאמה 81%', status: 'נצפה' },
    ], campaigns: [], showDevelopers: true,
  },
  affiliate: {
    headline: 'מרוויחים משיווק נכסים של אחרים', subtitle: 'שותף שמפיץ נכסים ומקבל עמלה על כל עסקה',
    stats: [{ label: 'קליקים על הקישורים שלי', base: 1530, perTick: 2 }, { label: 'לידים שהבאתי', base: 34, perTick: 0.08 }, { label: 'נכסים בהפצה', base: 48, perTick: 0 }, { label: 'תגמולים צפויים', base: 12400, perTick: 6, suffix: '₪' }],
    tableTitle: 'נכסים שאני משווק', rows: [
      { title: 'פנטהאוז, הרצליה פיתוח', meta: 'תגמול ₪6,000 בסגירה', status: 'בהפצה' },
      { title: 'מגדלי הים, בת ים', meta: 'תגמול ₪150 לליד', status: 'בהפצה' },
      { title: '3 חד׳ בנווה צדק', meta: 'תגמול 20% מחודש ראשון', status: 'בהפצה' },
    ], campaigns: campaigns.slice(0, 2), showDevelopers: true,
  },
};

export const RITA_CHAT: { from: 'lead' | 'rita'; text: string }[] = [
  { from: 'lead', text: 'היי, ראיתי את הדירה ברמת גן. עדיין רלוונטית?' },
  { from: 'rita', text: 'היי! כן, הדירה זמינה. 4 חדרים, קומה 5 עם מעלית וחניה. מה התקציב שלך?' },
  { from: 'lead', text: 'בסביבות 2.9 מיליון, יש לנו משכנתא מאושרת' },
  { from: 'rita', text: 'מצוין, זה מתאים. אפשר לקבוע סיור ביום חמישי ב-17:00?' },
  { from: 'lead', text: 'מעולה, קבעי' },
  { from: 'rita', text: 'נקבע! שלחתי אישור ב-WhatsApp והעברתי לך ליד מסונן לסוכן.' },
];
