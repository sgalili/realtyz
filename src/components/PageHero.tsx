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
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Plus, FileSpreadsheet, User, ArrowLeft, ArrowRight, Calendar as CalendarIcon } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RealtyzWave } from '@/components/RealtyzWave';
// CreditBalancePill moved to /billing (Packages & Payments page).
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SOURCE_LABELS_HE: Record<string, string> = {
  yad2: 'יד2',
  'yad-2': 'יד2',
  yad_2: 'יד2',
  madlan: 'מדל״ן',
  homely: 'Homely',
  manual: 'ידני',
};

function usePropertyHeroSuffix(pathname: string): string {
  const match = pathname.match(/^\/properties\/([^/]+)/);
  const id = match?.[1];
  const { data } = useQuery({
    queryKey: ['property-hero-source', id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: row } = await supabase.from('listings').select('source').eq('id', id!).maybeSingle();
      return (row?.source as string | null) || '';
    },
  });
  if (!data) return '';
  const key = String(data).toLowerCase().trim();
  return SOURCE_LABELS_HE[key] || data;
}


function PropertiesHeroAddButton() {
  const dispatch = (action: 'manual' | 'import') =>
    window.dispatchEvent(new CustomEvent('properties:add', { detail: { action } }));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
          aria-label="הוספת נכס"
        >
          <Plus className="!h-5 !w-5" strokeWidth={2.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => dispatch('manual')} className="gap-2">
          <Plus className="h-4 w-4" /> הוספת נכס ידנית
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch('import')} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> יבוא נכסים מאקסל
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadsHeroAddButton() {
  const dispatch = (action: 'manual' | 'import') =>
    window.dispatchEvent(new CustomEvent('leads:add', { detail: { action } }));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
          aria-label="הוספת מתעניין"
        >
          <Plus className="!h-5 !w-5" strokeWidth={2.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => dispatch('manual')} className="gap-2">
          <User className="h-4 w-4" /> הוספת מתעניין
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch('import')} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> ייבוא מתעניינים
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CampaignsHeroAddButton() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = (searchParams.get('tab') ?? 'published') === 'create';
  const toggle = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', active ? 'published' : 'create');
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggle}
      aria-label={active ? 'חזרה לקמפיינים' : 'יצירת קמפיין חדש'}
      title={active ? 'חזרה לקמפיינים' : 'יצירת קמפיין חדש'}
      className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
    >
      {active ? (
        <ArrowRight className="!h-5 !w-5 scale-x-[-1]" strokeWidth={2.5} />
      ) : (
        <Plus className="!h-5 !w-5" strokeWidth={2.5} />
      )}
    </Button>
  );
}


const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/(dashboard)?$/, title: 'לוח בקרה' },
  { match: /^\/lead-crm/, title: 'ניהול מתעניינים' },
  { match: /^\/inbox/, title: 'צ׳אטים בכל הערוצים' },
  { match: /^\/communication/, title: 'צ׳אטים בכל הערוצים' },
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
  { match: /^\/profile/, title: 'הפרופיל שלי' },
  { match: /^\/billing/, title: 'חבילה וחשבוניות' },
  { match: /^\/auth/, title: 'התחברות' },
];

function resolvePageTitle(pathname: string): string {
  return ROUTE_TITLES.find((r) => r.match.test(pathname))?.title ?? '';
}

export function PageHero() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const title = resolvePageTitle(location.pathname);
  const isPropertyDetail = /^\/properties\/[^/]+/.test(location.pathname);
  const propertySuffix = usePropertyHeroSuffix(location.pathname);
  const displayTitle = isPropertyDetail && propertySuffix
    ? `${title} - ${propertySuffix}`
    : title;

  // On /campaigns with a lead context, CampaignCenter renders its own
  // avatar+name hero — skip the default hero to avoid a stacked duplicate.
  if (
    location.pathname.startsWith('/campaigns') &&
    (searchParams.get('lead') || searchParams.get('client') || searchParams.get('voter'))
  ) {
    return null;
  }

  return (
    <div
      dir="rtl"
      data-page-hero
      className="relative w-full shrink-0 overflow-hidden text-white print:hidden"
      style={{ backgroundColor: '#0b3982' }}
    >
      {/* 3-zone toolbar — title is absolutely centered to the viewport so it
          stays perfectly centered regardless of side controls' widths. */}
      <div
        className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6"
        style={{ minHeight: '65px', paddingTop: '10px', paddingBottom: '10px' }}
      >
        {/* Visual right (RTL flex start): Burger / nav toggle */}
        <SidebarTrigger
          className="h-10 w-10 text-white hover:bg-white/10 hover:text-white [&_svg]:!h-6 [&_svg]:!w-6"
          aria-label="פתח תפריט"
          style={{ marginRight: '-15px' }}
        >
          <Menu className="h-6 w-6" />
        </SidebarTrigger>

        {/* Absolute-centered page title — locked to screen center */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap pt-[10px] pb-[20px] text-center text-xl font-bold tracking-tight text-white sm:text-2xl">
          {displayTitle}
        </h1>

        {/* Visual left (RTL flex end): page-specific action button */}
        <div className="flex items-center justify-end gap-2" style={{ marginLeft: '-5px' }}>
          {location.pathname === '/properties' && <PropertiesHeroAddButton />}
          {location.pathname.startsWith('/lead-crm') && <LeadsHeroAddButton />}
          {location.pathname.startsWith('/campaigns') && <CampaignsHeroAddButton />}
          {isPropertyDetail && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => navigate('/properties')}
              aria-label="חזרה לקטלוג הנכסים"
              className="h-10 w-10 rounded-full text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="!h-6 !w-6" strokeWidth={2.5} />
            </Button>
          )}
        </div>

      </div>


      {/* Decorative wave at the bottom edge — fill matches the page surface
          (#f1f5f9) so the wave melts seamlessly into the content below. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6">
        <RealtyzWave
          position="bottom"
          variant="wave-soft"
          fill="#0b3982"
          seed={7}
        />
      </div>
    </div>
  );
}

export default PageHero;
