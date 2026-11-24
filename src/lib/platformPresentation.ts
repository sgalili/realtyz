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

const BROKER_VISITOR_DESCRIPTIONS: Record<string, string> = {
  '/about-toraff': 'הכירו את TORAFF למתווכים: נכסים, ייבוא מיד2, לידים, ריטה, קמפיינים, מטלות וחתימות דיגיטליות.',
  '/faq': 'תשובות על סביבת העבודה למתווכים, התחברות בקוד, מרחב הדגמה, ניהול נכסים ולידים וקרדיטים.',
  '/terms': 'תנאי השימוש בכלי TORAFF למתווכים: הרשאות משרד, נכסים, ריטה, קמפיינים, חתימות וקרדיטים.',
  '/privacy-policy': 'כיצד TORAFF מעבדת ומגינה על נתוני המשרד, הלקוחות, הלידים והשיחות בסביבת העבודה למתווכים.',
  '/commission-mechanism': 'תמחור וקרדיטים ב-TORAFF למתווכים: חיוב לפי שימוש, השלמה חודשית, טעינת ארנק ושקיפות לפני ביצוע פעולה.',
  '/pricing': 'מידע על תמחור וקרדיטים לכלי העבודה למתווכים ב-TORAFF.',
  '/contact': 'צרו קשר עם TORAFF לעזרה בהתחברות, בריטה ובכלי ניהול המשרד למתווכים.',
};

export function platformPageMetadata(mode: PlatformMode | undefined, pathname: string, canonicalPath = pathname) {
  const presentation = platformPresentation(mode);
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const brokersOnly = mode !== 'full_marketplace';
  const label = ROUTE_TITLES[path] ?? (brokersOnly ? ({ '/commission-mechanism': 'תמחור וקרדיטים', '/pricing': 'תמחור שירותים וקרדיטים', '/contact': 'צרו קשר' } as Record<string, string>)[path] : undefined);
  return {
    ...presentation,
    description: brokersOnly ? BROKER_VISITOR_DESCRIPTIONS[path] ?? presentation.description : presentation.description,
    title: label ? `${label} | ${presentation.title}` : presentation.title,
    canonical: `https://toraff.co.il${canonicalPath === '/' ? '/' : canonicalPath.replace(/\/$/, '')}`,
  };
}

/** Leaf-route fallback; PlatformMetadata applies the current public mode after hydration. */
export function visitorRouteHead(path: string) {
  const metadata = platformPageMetadata(undefined, path);
  return { meta: [
    { title: metadata.title }, { name: 'description', content: metadata.description },
    { property: 'og:title', content: metadata.title }, { property: 'og:description', content: metadata.description },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] };
}