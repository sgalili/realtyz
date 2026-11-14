// Contextual tutorials: content registry + per-user seen/dismissed state.
// "seen" = user clicked הבנתי (no more auto-open, ❓ stays).
// Dismissal suppresses automatic guides only; manual help remains visible.
import { useSyncExternalStore } from 'react';

export type TutorialSlide = { emoji: string; title: string; body: string; bullets?: string[] };
export type Tutorial = { id: string; title: string; slides: TutorialSlide[] };

export const TUTORIALS: Record<string, Tutorial> = {
  'page:/command-center': { id: 'page:/command-center', title: 'מטלות', slides: [
    { emoji: '✅', title: 'כל המשימות שלך במקום אחד', body: 'כאן מופיעות המטלות של היום: שיחות חוזרות, סיורים ומעקבים.', bullets: ['📅 מסודר לפי מועד', '⚡ לחיצה על משימה פותחת את הליד'] },
    { emoji: '🤖', title: 'ניהול אישי', body: 'מוסיפים מטלה, בוחרים מועד ומעדכנים כשהטיפול הסתיים.' },
  ]},
  'page:/dashboard': { id: 'page:/dashboard', title: 'לוח בקרה', slides: [
    { emoji: '📊', title: 'תמונת מצב מהירה', body: 'נתונים חיים על לידים, נכסים, פניות ועסקאות.', bullets: ['📈 מגמות של 7 ימים', '🔥 לידים חמים'] },
  ]},
  'page:/campaigns': { id: 'page:/campaigns', title: 'קמפיינים', slides: [
    { emoji: '📣', title: 'מכינים קמפיין', body: 'בוחרים נכס, יוצרים תוכן ובודקים טיוטה. כלי פייסבוק המסומנים **בקרוב** עדיין אינם זמינים.' },
  ]},
  'page:/lead-crm': { id: 'page:/lead-crm', title: 'לידים', slides: [
    { emoji: '👥', title: 'כל הלידים', body: 'חיפוש, סינון ומיון של כל הלידים במשרד.', bullets: ['📥 ייבוא מקובץ', '🏷️ תגיות ושלבים', '☑️ בחירה מרובה לפעולות'] },
  ]},
  'page:/properties': { id: 'page:/properties', title: 'נכסים', slides: [
    { emoji: '🏠', title: 'מלאי הנכסים שלך', body: 'מייבאים או מוסיפים נכס, בודקים פרטים ושומרים טיוטה. לפני פרסום משלימים ושומרים **מחירים ותגמולים**.' },
    { emoji: '🤝', title: 'ניהול מודעות', body: 'פותחים שורה לפרטים, תמונות ופעולות. עצירת הפצה דורשת אישור.' },
  ]},
  'page:/inbox': { id: 'page:/inbox', title: 'צ׳אטים/קהילה', slides: [
    { emoji: '💬', title: 'צ׳אטים וקהילה', body: '**צ׳אטים** מרכזת שיחות לקוחות. **קהילה** פותחת שיחות וקבוצות עם חברי המערכת. החיפוש והמועדפים נפרדים בכל לשונית.' },
    { emoji: '👥', title: 'מוסיפים ושומרים', body: '**הוסף משתמש** פותח כרטיס לקוח בצ׳אטים ומדריך חברים בקהילה. סימניית שיחה או הודעה נשמרת בחלון **מועדפים**.' },
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
    { emoji: '🏡', title: 'הנכסים שפרסמת', body: 'רואים נכסים, צפיות ופניות; פותחים מודעה כדי לעדכן פרטים ולאשר זמינות.' },
  ]},
};

/** Menu-item tutorials reuse page tutorials by URL. */
export const tutorialForPath = (path: string): Tutorial | null => {
  const aliases: Record<string, string> = { '/partner/chats': '/inbox', '/communication': '/inbox', '/posts': '/campaigns', '/developers': '/developer-dashboard' };
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
