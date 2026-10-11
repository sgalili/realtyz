import { useSyncExternalStore } from 'react';

export const APP_TOUR_EVENT = 'realtyz:start-tour';
export type WalkthroughStep = {
  title: string;
  body: string;
  selector?: string;
  path?: string;
  sidebar?: boolean;
};
type Session = { steps: WalkthroughStep[]; index: number; origin: string; userId: string; workspaceId: string };
let session: Session | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const walkthroughStore = {
  get: () => session,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  start(steps: WalkthroughStep[], origin: string, userId: string, workspaceId: string) {
    session = { steps, index: 0, origin, userId, workspaceId }; emit();
  },
  move(index: number) {
    if (!session || index < 0 || index >= session.steps.length) return;
    session = { ...session, index }; emit();
  },
  stop() { session = null; emit(); },
};
export const useWalkthrough = () => useSyncExternalStore(walkthroughStore.subscribe, walkthroughStore.get, walkthroughStore.get);

const PAGE_COPY: Record<string, string> = {
  '/': 'מחפשים נכס, משווים מודעות ושומרים את הנכסים שאהבתם.',
  '/public-listings': 'מחפשים נכס, משווים מודעות ושומרים את הנכסים שאהבתם.',
  '/command-center': 'מרכזים מטלות, שיחות חוזרות ומעקבים, ומעדכנים את ההתקדמות.',
  '/dashboard': 'בודקים את תמונת הפעילות העדכנית של המשרד.',
  '/campaigns': 'יוצרים תוכן, בוחרים יעדים ומתזמנים פרסומים.',
  '/posts': 'עוקבים אחרי הפוסטים והשיתופים שלכם.',
  '/lead-crm': 'מחפשים לידים, מעדכנים פרטים ועוקבים אחרי הפעילות.',
  '/properties': 'מנהלים את מלאי הנכסים, מייבאים מיד2 ומכינים מודעות לפרסום.',
  '/developers': 'מנהלים חברות יזמיות ואת פרטי הפרויקטים שלהן.',
  '/developer-dashboard': 'מנהלים פרויקטים, תמהיל יחידות, תמונות ומפרטים, או מייבאים מעמוד היזם ביד2.',
  '/inbox': 'קוראים שיחות וממשיכים את התקשורת עם הלידים.',
  '/deal-room': 'עוקבים אחרי התקדמות העסקאות ומעדכנים את השלבים.',
  '/affiliate-network': 'בוחרים נכסים לשיתוף, מעתיקים קישור אישי ועוקבים אחרי הפניות והתגמולים.',
  '/referral': 'משתפים הזמנה אישית ועוקבים אחרי ההזמנות שלכם.',
  '/partner/contacts': 'עוקבים אחרי הלידים שהגיעו מהשיתופים שלכם.',
  '/partner/chats': 'ממשיכים שיחות הקשורות לפעילות שלכם.',
  '/owner/properties': 'מנהלים את הנכסים שלכם ומאשרים את זמינותם.',
  '/owner/leads': 'רואים את הפניות לנכסים שלכם וממשיכים את הקשר.',
  '/owner/rewards': 'מעדכנים את תגמולי השיווק לנכסים שלכם.',
  '/owner/rita': 'משוחחים עם ריטה על הנכסים והפעילות שלכם.',
};
const ACTION_COPY: Record<string, { selector: string; title: string; body: string }> = {
  '/developer-dashboard': { selector: '[aria-label="הוספת פרויקט"]', title: 'מוסיפים פרויקט', body: 'הפלוס פותח בחירה בין ייבוא מעמוד היזם ביד2 לבין יצירה ידנית בשלבים.' },
  '/properties': { selector: '[data-page-hero] button[title*="נכס"], [data-page-hero] button[aria-label*="הוספ"]', title: 'מוסיפים נכס', body: 'פותחים את טופס הנכס, משלימים את הפרטים ובודקים אותם לפני אישור.' },
  '/lead-crm': { selector: '[data-page-hero] button[aria-label*="הוספ"], [data-page-hero] button[title*="ליד"]', title: 'מוסיפים ליד', body: 'מוסיפים פרטים וממשיכים במעקב האישי.' },
  '/': { selector: 'main input[placeholder="חיפוש חופשי"]', title: 'מוצאים את הנכס המתאים', body: 'מצמצמים את המודעות בעזרת חיפוש וסינון.' },
  '/public-listings': { selector: 'main input[placeholder="חיפוש חופשי"]', title: 'מוצאים את הנכס המתאים', body: 'מצמצמים את המודעות בעזרת חיפוש וסינון.' },
};

/** Use only navigation actually rendered by the authorized role/workspace/mode. */
export function buildWalkthrough(menus: { path: string; title: string }[]): WalkthroughStep[] {
  const steps: WalkthroughStep[] = [
    { title: 'ברוכים הבאים לרילטיז', body: '' },
    { title: 'התפריט שלכם', body: 'מכאן מגיעים למסכים של הפעילות שלכם.', selector: '[data-walkthrough="menu"]' },
  ];
  const paths = new Set<string>();
  for (const menu of menus) {
    if (!PAGE_COPY[menu.path] || paths.has(menu.path)) continue;
    paths.add(menu.path);
    steps.push({ title: menu.title.trim(), body: PAGE_COPY[menu.path], selector: `[data-walkthrough-path="${menu.path}"]`, sidebar: true });
    steps.push({ title: menu.title.trim(), body: PAGE_COPY[menu.path], selector: 'main', path: menu.path });
    const action = ACTION_COPY[menu.path];
    if (action) steps.push({ ...action, path: menu.path });
  }
  steps.push(
    { title: 'ריטה לצידכם', body: 'כאן פותחים את ריטה, מבקשים עזרה בתוכן ומקדמים את הפעילות.', selector: '[data-walkthrough="rita"]' },
    { title: 'הארנק שלכם', body: 'בודקים יתרה, תגמולים ותנועות, ופותחים את פירוט התשלומים.', selector: '[data-walkthrough="wallet"]', sidebar: true },
    { title: 'תנועות ותשלומים', body: 'כאן רואים את התנועות שלכם ופותחים את הפרטים שלהן.', selector: 'main', path: '/wallet' },
    { title: 'הפרופיל שלכם', body: 'מעדכנים פרטים אישיים ומנהלים את המדריכים שלכם.', selector: 'main', path: '/profile' },
    { title: 'יוצאים לדרך', body: 'הסיור הושלם. ריטה והכלים שלכם מחכים לכם; אפשר לחזור לסיור בכל עת דרך הדרכה בתפריט.' },
  );
  return steps;
}