/**
 * Unified Hero / Control Zone shown directly under the top header on every page.
 *
 * Layout (RTL):
 *   - Visual right: Burger / nav toggle (white)
 *   - Center:       Dynamic page title (white, bold)
 *   - Visual left:  Demo switch (DEMO label inside; green=ON, grey=OFF)
 *
 * Background: solid primary blue with the white RealtyzWave at the bottom.
 * Mounted once at the layout level to avoid per-route hero "jumps".
 */
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RealtyzWave } from '@/components/RealtyzWave';
import { DemoModeToggle } from '@/components/DemoModeToggle';

const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/(dashboard)?$/, title: 'לוח בקרה' },
  { match: /^\/lead-crm/, title: 'ניהול מתעניינים' },
  { match: /^\/inbox/, title: 'תיבת הודעות' },
  { match: /^\/deal-room/, title: 'עסקאות' },
  { match: /^\/properties\/[^/]+/, title: 'פרטי נכס' },
  { match: /^\/properties/, title: 'נכסים' },
  { match: /^\/automations/, title: 'Automation Studio' },
  { match: /^\/campaigns/, title: 'מרכז הקמפיינים' },
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
  return ROUTE_TITLES.find((r) => r.match.test(pathname))?.title ?? '';
}

export function PageHero() {
  const location = useLocation();
  const title = resolvePageTitle(location.pathname);

  return (
    <div
      dir="rtl"
      data-no-hero-wave
      className="relative w-full shrink-0 overflow-hidden text-primary-foreground print:hidden"
      style={{ backgroundColor: '#0082CA' }}
    >
      {/* Center-aligned 3-zone toolbar */}
      <div className="relative z-10 flex h-20 items-center justify-between gap-3 px-4 sm:px-6">
        {/* Visual right (RTL flex start): Burger / nav toggle */}
        <SidebarTrigger
          className="h-10 w-10 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground [&_svg]:!h-6 [&_svg]:!w-6"
          aria-label="פתח תפריט"
        >
          <Menu className="h-6 w-6" />
        </SidebarTrigger>

        {/* Center: dynamic page title */}
        <h1 className="min-w-0 flex-1 truncate text-center text-xl font-bold tracking-tight text-primary-foreground sm:text-2xl">
          {title}
        </h1>

        {/* Visual left (RTL flex end): Demo switch */}
        <div className="flex items-center justify-end">
          <DemoModeToggle variant="hero" />
        </div>
      </div>

      {/* Decorative wave at the bottom edge */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6">
        <RealtyzWave
          position="bottom"
          variant="wave-soft"
          fill="hsl(var(--background))"
          seed={7}
        />
      </div>
    </div>
  );
}

export default PageHero;
