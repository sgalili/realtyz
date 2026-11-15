// Contextual tutorials: content registry + per-user acknowledgement/dismissal state.
// "seen" records acknowledgement only; automatic guides repeat until dismissed.
// Manual help always remains available and never changes suppression.
import { useSyncExternalStore } from 'react';

export type TutorialIcon =
  | 'guide' | 'board' | 'tasks' | 'dashboard' | 'campaigns' | 'distribution'
  | 'leads' | 'users' | 'properties' | 'ads' | 'commissions' | 'inbox'
  | 'groups' | 'deal' | 'affiliate' | 'activity' | 'developer' | 'wallet'
  | 'profile' | 'owner' | 'rewards';

export type TutorialSlide = { icon: TutorialIcon; title: string; body: string; bullets?: string[] };
export type Tutorial = { id: string; title: string; slides: TutorialSlide[] };

export const TUTORIALS: Record<string, Tutorial> = {
  'page:/public-listings': { id: 'page:/public-listings', title: 'לוח השותפים של המדינה', slides: [
    { icon: 'board', title: 'כל הנכסים במקום אחד', body: 'מחפשים, מסננים ופותחים מודעה בכמה לחיצות. כל כרטיס מרכז את פרטי הנכס, המפרסם והפעולות הזמינות לך.', bullets: ['**חיפוש וסינון** למציאת נכס מדויק', '**שיתוף או יצירת קשר** ישירות מהמודעה'] },
  ]},
  'page:/command-center': { id: 'page:/command-center', title: 'מטלות', slides: [
    { icon: 'tasks', title: 'היום שלך, מסודר', body: 'כל השיחות החוזרות, הסיורים והמעקבים מחכים לך ברשימה אחת ברורה.', bullets: ['**הוספת מטלה** עם מועד ומשימה מוגדרת', '**לחיצה על מטלה** פותחת את הפרטים והפעולה הבאה'] },
    { icon: 'activity', title: 'מטפלים ומסמנים שהסתיימה', body: 'מעדכנים את המטלה ברגע שהטיפול הסתיים, כדי לשמור על יום עבודה רצוף ופשוט.' },
  ]},
  'page:/dashboard': { id: 'page:/dashboard', title: 'לוח בקרה', slides: [
    { icon: 'dashboard', title: 'הפעילות שלך בזמן אמת', body: 'מקבלים תמונת מצב עדכנית של לידים, נכסים, פניות ועסקאות, בלי לאסוף נתונים ממסכים שונים.', bullets: ['**מגמות ופעילות** מוצגות בצורה ברורה', '**לחיצה על נתון** מובילה לפרטים הרלוונטיים'] },
  ]},
  'page:/campaigns': { id: 'page:/campaigns', title: 'קמפיינים', slides: [
    { icon: 'campaigns', title: 'מהכנה ועד הפצה', body: 'בוחרים נכס, יוצרים תוכן ובודקים טיוטה לפני שליחה. כלי פייסבוק המסומנים **בקרוב** עדיין אינם זמינים.', bullets: ['**תזמון ושליחה** מהמסך שאתם כבר מכירים', '**מעקב אחרי סטטוס ההפצה** לכל יעד'] },
    { icon: 'distribution', title: 'ההפצה ממשיכה ברקע', body: 'נכסים שנוספו לתור נשמרים בו, ואפשר לחזור למסך ולראות את ההתקדמות והפעילות העדכנית.' },
  ]},
  'page:/lead-crm': { id: 'page:/lead-crm', title: 'לידים', slides: [
    { icon: 'users', title: 'מוסיפים ליד בכמה לחיצות', body: 'מוסיפים ליד ידנית או מייבאים רשימה, ואז מחפשים, מסננים ומעדכנים הכול ממקום אחד.', bullets: ['**ייבוא מקובץ** לרשימה קיימת', '**תגיות ושלבים** לניהול מסודר', '**בחירה מרובה** לפעולות משותפות'] },
  ]},
  'page:/properties': { id: 'page:/properties', title: 'נכסים', slides: [
    { icon: 'properties', title: 'מוסיפים נכס בקלות', body: 'מייבאים או מוסיפים נכס, בודקים את הפרטים ושומרים טיוטה. לפני פרסום משלימים ושומרים **מחירים ותגמולים**.' },
    { icon: 'commissions', title: 'קובעים תגמולים בצורה ברורה', body: 'פותחים את הנכס, מגדירים את התמחור הרצוי ושומרים. פותחים שורה לפרטים, תמונות ופעולות; עצירת הפצה דורשת אישור.' },
  ]},
  'page:/my-ads': { id: 'page:/my-ads', title: 'המודעות שלי', slides: [
    { icon: 'ads', title: 'פרסום ומעקב בלי מאמץ', body: 'כל המודעות שלך מרוכזות כאן. פותחים מודעה לצפייה בפרטים, מעדכנים אותה ורואים את הפעילות וההפצה שלה.', bullets: ['**צפיות, פניות ושיתופים** בתוך המודעה', '**פעולות פרסום והפצה** זמינות לכל מודעה'] },
  ]},
  'page:/inbox': { id: 'page:/inbox', title: 'צ׳אטים/קהילה', slides: [
    { icon: 'inbox', title: 'שיחות, קבוצות וקהילה', body: 'עוברים בין **צ׳אטים** ל**קהילה** כדי לנהל שיחות פרטיות, קבוצות וערוצים. החיפוש והמועדפים נשמרים בכל תצוגה.' },
    { icon: 'groups', title: 'מוסיפים אנשים ויוצרים קבוצה', body: '**הוספת משתמש** פותחת פעולה חדשה בצ׳אטים או בקהילה. יוצרים קבוצה, בוחרים משתתפים ומתחילים לשוחח בקלות.', bullets: ['**סימניית שיחה או הודעה** נשמרת במועדפים', '**חיפוש משתמשים** מזרז יצירת שיחה או קבוצה'] },
  ]},
  'page:/deal-room': { id: 'page:/deal-room', title: 'עסקאות', slides: [
    { icon: 'deal', title: 'מקדמים כל עסקה בביטחון', body: 'גוררים כל עסקה בין השלבים, פותחים אותה לצפייה בפרטים ומעדכנים את הפעולה הבאה עד לסגירה.', bullets: ['**רישום עמלה** בכרטיס העסקה', '**חתימה דיגיטלית** מהפעולות הזמינות'] },
  ]},
  'page:/affiliate-network': { id: 'page:/affiliate-network', title: 'שיווק שותפים', slides: [
    { icon: 'affiliate', title: 'משתפים קישור אישי', body: 'בחרו נכס ולחצו על **העתקת קישור אישי**. שתפו את הקישור בוואטסאפ, בהודעה או באימייל.' },
    { icon: 'activity', title: 'מנהלים את השיתופים שלך', body: 'חזרו למסך שלכם כדי לעקוב אחרי **השיתופים והפניות** שהגיעו דרך הקישורים שלכם ולראות את הפעילות העדכנית.' },
    { icon: 'rewards', title: 'התגמולים שלך, בצורה ברורה', body: 'בדקו את **התגמולים שהתקבלו** ואת פירוט התנועות **בארנק**.' },
  ]},
  'page:/developer-dashboard': { id: 'page:/developer-dashboard', title: 'הפרויקטים שלי', slides: [
    { icon: 'developer', title: 'פרויקטים ויחידות במקום אחד', body: 'רואים את כל הפרויקטים ויחידות הדיור, מייבאים מעמוד היזם ביד2 ועורכים כל פרט בכל רגע.', bullets: ['**ייבוא פרויקט** למלאי הפרטי', '**עריכה ופרסום** רק כשאתם מוכנים'] },
  ]},
  'page:/wallet': { id: 'page:/wallet', title: 'ארנק', slides: [
    { icon: 'wallet', title: 'היתרה והתנועות שלך', body: 'בדקו את **היתרה** ואת **היסטוריית התנועות** שלכם, ולחצו על כל תנועה לצפייה בפרטים.', bullets: ['**טעינת קרדיטים** בחבילה שמתאימה לך', '**ניהול אמצעי תשלום** מהאזור המאובטח'] },
  ]},
  'page:/profile': { id: 'page:/profile', title: 'פרופיל', slides: [
    { icon: 'profile', title: 'הפרטים שלך, בדיוק כפי שרוצים', body: 'עדכנו את **הפרטים והתמונה** שלכם. כל שדה נשמר בנפרד, כך שהעדכון מהיר ופשוט.', bullets: ['**עריכת פרופיל** באמצעות סמל העריכה לצד השדה', '**המדריכים** תמיד זמינים בסימני השאלה'] },
  ]},
  'page:/owner/properties': { id: 'page:/owner/properties', title: 'הנכסים שלי', slides: [
    { icon: 'owner', title: 'הנכסים והפניות שלך', body: 'רואים נכסים, צפיות ופניות במקום אחד. פותחים מודעה כדי לעדכן פרטים ולאשר זמינות, ועוקבים אחרי הפעילות העדכנית.' },
  ]},
};

/** Menu-item tutorials reuse page tutorials by URL. */
export const tutorialForPath = (path: string): Tutorial | null => {
  const aliases: Record<string, string> = {
    '/': '/public-listings',
    '/partner/chats': '/inbox',
    '/communication': '/inbox',
    '/posts': '/campaigns',
    '/developers': '/developer-dashboard',
  };
  path = aliases[path] ?? path;
  const key = Object.keys(TUTORIALS).filter((k) => k.startsWith('page:')).sort((a, b) => b.length - a.length)
    .find((k) => { const p = k.slice(5); return path === p || path.startsWith(`${p}/`); });
  return key ? TUTORIALS[key] : null;
};

type State = { seen: string[]; dismissed: string[] };
const KEY = 'realtyz-tutorials:v1';
let uid = 'anon';
let state: State = { seen: [], dismissed: [] };
const listeners = new Set<() => void>();
const load = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${KEY}:${uid}`) ?? '') as Partial<State>;
    state = { seen: Array.isArray(parsed.seen) ? parsed.seen : [], dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [] };
  } catch { state = { seen: [], dismissed: [] }; }
};
const save = () => { try { localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(state)); } catch { /* ignore */ } listeners.forEach((l) => l()); };

/** Seen pages still open on later visits; only explicit dismissal suppresses them. */
export const shouldAutoOpenTutorial = (state: State, id: string) => !state.dismissed.includes(id);

export const tutorialStore = {
  setUser(id: string | null | undefined) { const n = id ?? 'anon'; if (n !== uid) { uid = n; load(); listeners.forEach((l) => l()); } },
  markSeen(id: string) { if (!state.seen.includes(id)) { state = { ...state, seen: [...state.seen, id] }; save(); } },
  dismiss(id: string) { state = { seen: [...new Set([...state.seen, id])], dismissed: [...new Set([...state.dismissed, id])] }; save(); },
  restoreAll(resetSeen = false) { state = { seen: resetSeen ? [] : state.seen, dismissed: [] }; save(); },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  get: () => state,
};
load();

export function useTutorialState() {
  return useSyncExternalStore(tutorialStore.subscribe, tutorialStore.get, tutorialStore.get);
}

// Open requests from ❓ buttons anywhere in the app are always manual.
type Opener = (t: Tutorial) => void;
let opener: Opener | null = null;
export const registerTutorialOpener = (fn: Opener | null) => { opener = fn; };
export const openTutorial = (t: Tutorial) => opener?.(t);
