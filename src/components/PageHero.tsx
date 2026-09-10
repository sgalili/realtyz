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
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Plus, FileSpreadsheet, User, ArrowLeft, ArrowRight, DownloadCloud, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrightDataHeroPill } from '@/components/BrightDataHeroPill';
import { AiResponseToggle } from '@/components/AiResponseToggle';
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
  const dispatch = (action: 'manual' | 'import' | 'homely') =>
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
        <DropdownMenuItem onClick={() => dispatch('homely')} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> סנכרון מלא מהומלי
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadsHeroAddButton() {
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const on = () => setBusy(true);
    const off = () => setBusy(false);
    window.addEventListener('leads:busy:on', on);
    window.addEventListener('leads:busy:off', off);
    return () => {
      window.removeEventListener('leads:busy:on', on);
      window.removeEventListener('leads:busy:off', off);
    };
  }, []);
  const dispatch = (action: 'manual' | 'import' | 'homely') => {
    if (busy) return;
    window.dispatchEvent(new CustomEvent('leads:add', { detail: { action } }));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={busy}
          className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-100"
          aria-label="הוספת איש קשר"
        >
          {busy
            ? <Loader2 className="!h-5 !w-5 animate-spin" strokeWidth={2.5} />
            : <Plus className="!h-5 !w-5" strokeWidth={2.5} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => dispatch('manual')} className="gap-2" disabled={busy}>
          <User className="h-4 w-4" /> הוספת איש קשר
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch('import')} className="gap-2" disabled={busy}>
          <FileSpreadsheet className="h-4 w-4" /> ייבוא אנשי קשר
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch('homely')} className="gap-2" disabled={busy}>
          <DownloadCloud className="h-4 w-4" /> משיכת אנשי קשר מ-Homely
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}



function CampaignsHeroAddButton() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'published';
  const isCreate = tab === 'create';
  const isCalendar = tab === 'calendar';
  // When the composer was launched from the calendar, the back arrow must
  // strictly return there instead of the default sent feed.
  const cameFromCalendar = isCreate && (searchParams.has('schedule') || searchParams.has('properties'));
  const handleClick = () => {
    if (isCalendar) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'published');
      next.delete('sub');
      setSearchParams(next, { replace: true });
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (isCreate && cameFromCalendar) {
      next.set('tab', 'calendar');
      // Strip composer-only params so the calendar doesn't re-trigger.
      ['schedule', 'listing', 'properties', 'variant', 'variants'].forEach((k) => next.delete(k));
    } else {
      next.set('tab', isCreate ? 'published' : 'create');
    }
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };
  const label = isCalendar
    ? 'חזרה לדשבורד'
    : isCreate
      ? (cameFromCalendar ? 'חזרה ללוח השנה' : 'חזרה לקמפיינים')
      : 'יצירת קמפיין חדש';

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
    >
      {isCreate || isCalendar ? (
        <ArrowLeft className="!h-5 !w-5" strokeWidth={2.5} />
      ) : (
        <Plus className="!h-5 !w-5" strokeWidth={2.5} />
      )}
    </Button>
  );
}

/**
 * Live Facebook sync for the posts feed. Fires `rz:campaigns-sync`; the feed
 * pulls fresh native posts, counters and comment trees, then answers with
 * `rz:campaigns-sync:done` so the spinner stops.
 */
function CampaignsHeroSyncButton() {
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const done = () => setBusy(false);
    window.addEventListener('rz:campaigns-sync:done', done as EventListener);
    return () => window.removeEventListener('rz:campaigns-sync:done', done as EventListener);
  }, []);
  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent('rz:campaigns-sync'));
    // Safety net: never leave the icon spinning forever.
    window.setTimeout(() => setBusy(false), 45_000);
  };
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleClick}
      disabled={busy}
      aria-label="סנכרון פוסטים מפייסבוק"
      title="סנכרון פוסטים מפייסבוק"
      className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-100"
    >
      <RefreshCw className={cn('!h-5 !w-5', busy && 'animate-spin')} strokeWidth={2.5} />
    </Button>
  );
}






const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: 'משימות היום' },
  { match: /^\/(command-center|tasks)/, title: 'משימות היום' },
  { match: /^\/dashboard$/, title: 'לוח בקרה' },
  { match: /^\/lead-crm/, title: 'אנשי קשר' },
  { match: /^\/inbox/, title: 'צ׳אטים בכל הערוצים' },
  { match: /^\/communication/, title: 'צ׳אטים בכל הערוצים' },
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
  { match: /^\/profile/, title: 'הפרופיל שלי' },
  { match: /^\/billing/, title: 'חבילה וחשבוניות' },
  { match: /^\/auth/, title: 'התחברות' },
];

function resolvePageTitle(pathname: string): string {
  return ROUTE_TITLES.find((r) => r.match.test(pathname))?.title ?? '';
}

/** Only super admins and the official platform owners see the wallet balance. */
const BALANCE_OWNER_EMAILS = ['sgalili@gmail.com', 'udi@udiman.com', 'udi.vitman@gmail.com'];

export function PageHero() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const canSeeBalance =
    isSuperAdmin || BALANCE_OWNER_EMAILS.includes((user?.email ?? '').toLowerCase());
  const title = resolvePageTitle(location.pathname);
  const isPropertyDetail = /^\/properties\/[^/]+/.test(location.pathname);
  const propertySuffix = usePropertyHeroSuffix(location.pathname);
  const campaignsTab = searchParams.get('tab') ?? 'published';
  const isCampaignsCreate = location.pathname.startsWith('/campaigns') && campaignsTab === 'create';
  const isCampaignsCalendar = location.pathname.startsWith('/campaigns') && campaignsTab === 'calendar';
  // Property-detail title renders strictly as "פרטי נכס" — no external source
  // suffix (Homely/Webtiv/Yad2/etc.) is appended.
  void propertySuffix;
  void isPropertyDetail;
  const displayTitle = isCampaignsCreate
    ? 'פרסום פוסט חדש'
    : isCampaignsCalendar
      ? 'פרסומים מתוזמנים'
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
      className="relative w-full shrink-0 overflow-hidden text-white print:hidden mb-[10px]"
      style={{ backgroundColor: '#0b3982' }}
    >
      {/* 3-zone toolbar — title is absolutely centered to the viewport so it
          stays perfectly centered regardless of side controls' widths. */}
      <div
        className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6"
        style={{ minHeight: '65px', paddingTop: '10px', paddingBottom: '10px' }}
      >
        {/* Visual right (RTL flex start): Burger / nav toggle + AI response + optional history */}
        <div className="flex items-center gap-1" style={{ marginRight: '-15px' }}>
          <SidebarTrigger
            className="h-10 w-10 text-white hover:bg-white/10 hover:text-white [&_svg]:!h-6 [&_svg]:!w-6"
            aria-label="פתח תפריט"
          >
            <Menu className="h-6 w-6" />
          </SidebarTrigger>
          {(location.pathname.startsWith('/campaigns') ||
            location.pathname.startsWith('/inbox')) && <AiResponseToggle />}
          {/* Live Bright Data wallet balance — owners / super admins only. */}
          {canSeeBalance && <BrightDataHeroPill />}
        </div>

        {/* Absolute-centered page title — locked to screen center */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap pt-[10px] pb-[20px] text-center text-xl font-bold tracking-tight text-white sm:text-2xl">
          {displayTitle}
        </h1>

        {/* Visual left (RTL flex end): page-specific action button */}
        <div className="relative z-30 flex items-center justify-end gap-2" style={{ marginLeft: '-5px' }}>
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
