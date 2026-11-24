import type { PlatformMode } from '@/hooks/usePlatformMode';

/** Keep the original marketplace copy intact for a reversible mode switch. */
export const PLATFORM_PRESENTATION = {
  brokers_only: {
    title: 'TORAFF | מערכת ההפעלה למתווכי נדל״ן',
    description: 'TORAFF וריטה, סוכנת ה-AI שלך: ניהול נכסים ולידים, קמפיינים, מטלות, חתימות דיגיטליות וכלים למתווכי נדל״ן במקום אחד.',
    shareText: 'TORAFF, מערכת ההפעלה למתווכי נדל״ן. נכסים, לידים, קמפיינים, מטלות וחתימות דיגיטליות במקום אחד.',
    tagline: 'המערכת היחידה שכל מתווך חייב',
    loaderTagline: 'המערכת היחידה שכל מתווך חייב',
  },
  full_marketplace: {
    title: 'TORAFF | לוח שותפים מטורף — פלטפורמת נדל"ן ואוטומציה חכמה',
    description: 'הכירו את TORAFF וריטה סוכנת ה-AI האישית שלך: לוח נדל"ן, שיתופי פעולה בין מתווכים ויזמים, אוטומציה חכמה לפייסבוק ויצירת לידים 24/7.',
    shareText: 'הכירו את TORAFF וריטה סוכנת ה-AI האישית שלך: לוח נדל"ן, שיתופי פעולה בין מתווכים ויזמים, אוטומציה חכמה לפייסבוק ויצירת לידים 24/7.',
    tagline: 'לוח. שותפים. מטורף!',
    loaderTagline: 'לוח השותפים של המדינה',
  },
} as const;

export function platformPresentation(mode?: PlatformMode) {
  return PLATFORM_PRESENTATION[mode === 'full_marketplace' ? 'full_marketplace' : 'brokers_only'];
}

const ROUTE_TITLES: Record<string, string> = {
  '/properties': 'הנכסים שלי', '/dashboard': 'לוח הבקרה', '/campaigns': 'קמפיינים',
  '/command-center': 'מטלות', '/signatures': 'חתימות דיגיטליות', '/inbox': 'צ׳אטים',
  '/profile': 'הפרופיל שלי', '/auth': 'כניסה והרשמה', '/wallet': 'קרדיטים',
  '/faq': 'שאלות ותשובות', '/about-toraff': 'מה זה TORAFF', '/what-is-toraff': 'מה זה TORAFF',
  '/terms': 'תנאי שימוש', '/privacy-policy': 'מדיניות פרטיות',
};

export function platformPageMetadata(mode: PlatformMode | undefined, pathname: string, canonicalPath = pathname) {
  const presentation = platformPresentation(mode);
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const label = ROUTE_TITLES[path];
  return {
    ...presentation,
    title: label ? `${label} | ${presentation.title}` : presentation.title,
    canonical: `https://toraff.co.il${canonicalPath === '/' ? '/' : canonicalPath.replace(/\/$/, '')}`,
  };
}