/**
 * Sub-header / context toolbar that sits directly below the global header
 * on every page. RTL layout:
 *   - Right (visual): Burger / nav toggle
 *   - Center: Dynamic page title derived from current route
 *   - Left  (visual): reserved spacer (kept for symmetry / future actions)
 *
 * Stays full-width with a subtle surface background to separate it from
 * the page content. On small screens it stays single-row but compresses
 * the title (truncate) so the controls always fit.
 */
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: 'משימות היום' },
  { match: /^\/(command-center|tasks)/, title: 'משימות היום' },
  { match: /^\/dashboard$/, title: 'לוח בקרה' },
  { match: /^\/lead-crm/, title: 'אנשי קשר' },
  { match: /^\/inbox/, title: 'תיבת הודעות' },
  { match: /^\/deal-room/, title: 'עסקאות' },
  { match: /^\/properties\/[^/]+/, title: 'פרטי נכס' },
  { match: /^\/properties/, title: 'נכסים' },
  { match: /^\/automations/, title: 'Automation Studio' },
  { match: /^\/campaigns/, title: 'פוסטים' },
  { match: /^\/campaign-strategy/, title: 'אסטרטגיית קמפיין' },
  { match: /^\/approval(-queue)?/, title: 'אישור פרסומים' },
  { match: /^\/calendar/, title: 'יומן תוכן' },
  { match: /^\/sms-blast/, title: 'הפצת SMS' },
  { match: /^\/ads/, title: 'מודעות' },
  { match: /^\/live-conversations/, title: 'שיחות חיות' },
  { match: /^\/knowledge/, title: 'מאגר הידע' },
  { match: /^\/ai-content/, title: 'מחולל תוכן AI' },
  { match: /^\/sentiment/, title: 'ניתוח סנטימנט' },
  { match: /^\/conversation-analytics/, title: 'ניתוח שיחות' },
  { match: /^\/insights/, title: 'Performance Insights' },
  { match: /^\/activity-log/, title: 'יומן פעילות' },
  { match: /^\/subscription/, title: 'ניהול חבילה' },
  { match: /^\/finance/, title: 'חיובים וחשבוניות' },
  { match: /^\/social-connect/, title: 'חיבור רשתות חברתיות' },
  { match: /^\/api-settings/, title: 'הגדרות API ותשתיות' },
  { match: /^\/super-admin/, title: 'ממשק ניהול על' },
  { match: /^\/security/, title: 'אבטחה' },
  { match: /^\/privacy/, title: 'פרטיות וציות' },
  { match: /^\/team/, title: 'ניהול צוות' },
  { match: /^\/settings\/branding/, title: 'מיתוג הסוכנות' },
  { match: /^\/settings\/system-health/, title: 'תקינות המערכת' },
  { match: /^\/leads/, title: 'פניות נכנסות' },
  { match: /^\/auth/, title: 'התחברות' },
];

function resolvePageTitle(pathname: string): string {
  const found = ROUTE_TITLES.find((r) => r.match.test(pathname));
  return found?.title ?? '';
}

export function PageToolbar() {
  const location = useLocation();
  const title = resolvePageTitle(location.pathname);

  return (
    <div
      dir="rtl"
      className="w-full border-b border-border bg-card/60 backdrop-blur-sm print:hidden"
    >
      <div className="flex h-12 items-center justify-between gap-2 px-3 sm:px-6">
        {/* Right (visual): burger / nav toggle */}
        <SidebarTrigger
          className="h-9 w-9 text-foreground hover:bg-muted [&_svg]:!h-5 [&_svg]:!w-5"
          aria-label="פתח תפריט"
        >
          <Menu className="h-5 w-5" />
        </SidebarTrigger>

        {/* Center: dynamic page title */}
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold text-foreground sm:text-lg">
          {title}
        </h1>

        {/* Left (visual): reserved spacer to balance the burger on the right */}
        <div className="h-9 w-9" aria-hidden="true" />
      </div>
    </div>
  );
}

export default PageToolbar;
