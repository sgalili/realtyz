// Contextual tutorials: content registry + per-user seen/dismissed state.
// "seen" = user clicked הבנתי (no more auto-open, ❓ stays).
// "dismissed" = אל תציג לי את זה יותר (no auto-open and ❓ hidden) until restored in settings.
import { useSyncExternalStore } from 'react';

export type TutorialSlide = { emoji: string; title: string; body: string; bullets?: string[] };
export type Tutorial = { id: string; title: string; slides: TutorialSlide[] };

export const TUTORIALS: Record<string, Tutorial> = {
  'page:/command-center': { id: 'page:/command-center', title: 'מטלות', slides: [
    { emoji: '✅', title: 'כל המשימות שלך במקום אחד', body: 'כאן מופיעות המטלות של היום: שיחות חוזרות, סיורים ומעקבים.', bullets: ['📅 מסודר לפי מועד', '⚡ לחיצה על משימה פותחת את הליד'] },
    { emoji: '🤖', title: 'ריטה עוזרת', body: 'ריטה מציעה מטלות לפי הפעילות של הלידים שלך. אפשר לאשר, לדחות או לתזמן.' },
  ]},
  'page:/dashboard': { id: 'page:/dashboard', title: 'לוח בקרה', slides: [
    { emoji: '📊', title: 'תמונת מצב מהירה', body: 'נתונים חיים על לידים, נכסים, פניות ועסקאות.', bullets: ['📈 מגמות של 7 ימים', '🔥 לידים חמים'] },
  ]},
  'page:/campaigns': { id: 'page:/campaigns', title: 'פוסטים', slides: [
    { emoji: '📣', title: 'פרסום לקבוצות ולדף העסקי', body: 'יוצרים פוסט אחד ומפיצים לכל הקבוצות שבחרת.', bullets: ['🕒 תזמון מראש', '🔁 פרסום מחדש בלחיצה', '✅ סטטוס לכל קבוצה'] },
    { emoji: '☁️', title: 'חיבור מהיר לפייסבוק', body: '**חיבור באמצעות פייסבוק** מסנכרן את הקבוצות שלכם בענן. מייבאים קבוצות קיימות, מוצאים קבוצות נוספות בחיפוש ועוקבים אחר הפרסום והביצועים.' },
  ]},
  'page:/lead-crm': { id: 'page:/lead-crm', title: 'לידים', slides: [
    { emoji: '👥', title: 'כל הלידים', body: 'חיפוש, סינון ומיון של כל הלידים במשרד.', bullets: ['📥 ייבוא מקובץ', '🏷️ תגיות ושלבים', '☑️ בחירה מרובה לפעולות'] },
  ]},
  'page:/properties': { id: 'page:/properties', title: 'נכסים', slides: [
    { emoji: '🏠', title: 'מלאי הנכסים שלך', body: 'כל הנכסים של המשרד, כולל ייבוא מיד2.', bullets: ['🔗 הדבקת קישור יד2 מייבאת אוטומטית', '🚀 פרסום ללוח הציבורי'] },
    { emoji: '🤝', title: 'שיתוף עם שותפים', body: 'קבעו עמלה לשותפים והנכס יופץ ברשת השותפים.' },
  ]},
  'page:/inbox': { id: 'page:/inbox', title: 'צ׳אטים', slides: [
    { emoji: '💬', title: 'כל השיחות במסך אחד', body: 'וואטסאפ, SMS, פייסבוק ואימייל מגיעים לתיבה אחת.', bullets: ['🤖 ריטה יכולה לענות אוטומטית', '✋ אפשר להשתלט על שיחה בכל רגע'] },
  ]},
  'page:/deal-room': { id: 'page:/deal-room', title: 'עסקאות', slides: [
    { emoji: '🤝', title: 'מעקב עסקאות', body: 'גוררים כל עסקה בין השלבים עד לסגירה.', bullets: ['💰 רישום עמלה', '✍️ חתימה דיגיטלית'] },
  ]},
  'page:/affiliate-network': { id: 'page:/affiliate-network', title: 'שיווק שותפים', slides: [
    { emoji: '🔗', title: 'משתפים קישור אישי', body: 'בחרו נכס ולחצו על **העתקת קישור אישי**. שתפו את הקישור בוואטסאפ, בהודעה או באימייל.' },
    { emoji: '📊', title: 'עוקבים אחרי השיתופים', body: 'חזרו למסך שלכם כדי לעקוב אחרי **השיתופים והפניות** שהגיעו דרך הקישורים שלכם.' },
    { emoji: '👛', title: 'התגמולים שלכם', body: 'בדקו את **התגמולים שהתקבלו** ואת פירוט התנועות **בארנק**.' },
  ]},
  'page:/developer-dashboard': { id: 'page:/developer-dashboard', title: 'הפרויקטים שלי', slides: [
    { emoji: '🏗️', title: 'ניהול פרויקטים', body: 'כל הפרויקטים שלך ויחידות הדיור במקום אחד.', bullets: ['🔗 ייבוא מעמוד היזם ביד2', '✏️ עריכה ידנית בכל רגע'] },
  ]},
  'page:/wallet': { id: 'page:/wallet', title: 'ארנק', slides: [
    { emoji: '👛', title: 'הארנק שלך', body: 'בדקו את **היתרה** ואת **היסטוריית התנועות** שלכם.', bullets: ['🧾 לחצו על תנועה לצפייה **בפרטים**', '💳 נהלו את **אמצעי התשלום** שלכם'] },
  ]},
  'page:/profile': { id: 'page:/profile', title: 'פרופיל', slides: [
    { emoji: '🪪', title: 'הפרטים שלך', body: 'עדכנו את **הפרטים והתמונה** שלכם ושמרו את השינויים.', bullets: ['✏️ **עריכת פרופיל**', '❓ **המדריכים** זמינים בסימן השאלה'] },
  ]},
  'page:/owner/properties': { id: 'page:/owner/properties', title: 'הנכסים שלי', slides: [
    { emoji: '🏡', title: 'הנכסים שפרסמת', body: 'כאן רואים את הנכסים, הצפיות והפניות.', bullets: ['✅ אישור זמינות פעם בשבוע', '🤝 הפצה לשותפים'] },
  ]},
};

/** Menu-item tutorials reuse page tutorials by URL. */
export const tutorialForPath = (path: string): Tutorial | null => {
  const key = Object.keys(TUTORIALS).filter((k) => k.startsWith('page:')).sort((a, b) => b.length - a.length)
    .find((k) => { const p = k.slice(5); return path === p || path.startsWith(`${p}/`); });
  return key ? TUTORIALS[key] : null;
};

type State = { seen: string[]; dismissed: string[] };
const KEY = 'realtyz-tutorials:v1';
let uid = 'anon';
let state: State = { seen: [], dismissed: [] };
const listeners = new Set<() => void>();
const load = () => { try { state = JSON.parse(localStorage.getItem(`${KEY}:${uid}`) ?? '') as State; } catch { state = { seen: [], dismissed: [] }; } };
const save = () => { try { localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(state)); } catch { /* ignore */ } listeners.forEach((l) => l()); };

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

// Open requests from ❓ buttons anywhere in the app.
type Opener = (t: Tutorial) => void;
let opener: Opener | null = null;
export const registerTutorialOpener = (fn: Opener | null) => { opener = fn; };
export const openTutorial = (t: Tutorial) => opener?.(t);
