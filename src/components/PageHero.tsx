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
import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  FileSpreadsheet,
  User,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
  Loader2,
  RefreshCw,
  Wallet,
  Bot,
} from "lucide-react";
import { useAffiliatePreferences } from "@/hooks/useAffiliate";
import { useAppMode } from "@/hooks/useAppMode";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useWorkspace } from '@/hooks/useWorkspace';
import { useHomelyConnection } from '@/hooks/useHomelyConnection';
import { RealtyzWave } from "@/components/RealtyzWave";
import { PublicListingPublisher } from "@/components/public/PublicListingPublisher";
import { BrightDataHeroPill } from "@/components/BrightDataHeroPill";
import { AiResponseToggle } from "@/components/AiResponseToggle";
// CreditBalancePill moved to /billing (Packages & Payments page).
import { Button } from "@/components/ui/button";
import { UsagePriceListButton } from '@/components/billing/UsagePriceListButton';
import { AffiliateProgramHelp } from '@/components/affiliate/AffiliateProgramHelp';
import { cn } from "@/lib/utils";
import { readReturn, type ReturnState } from "@/lib/returnNav";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SOURCE_LABELS_HE: Record<string, string> = {
  yad2: "יד2",
  "yad-2": "יד2",
  yad_2: "יד2",
  manual: "ידני",
};

function usePropertyHeroSuffix(pathname: string): string {
  const { connected } = useHomelyConnection();
  const match = pathname.match(/^\/properties\/([^/]+)/);
  const id = match?.[1];
  const { data } = useQuery({
    queryKey: ["property-hero-source", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: row } = await supabase.from("listings").select("source").eq("id", id!).maybeSingle();
      return (row?.source as string | null) || "";
    },
  });
  if (!data) return "";
  const key = String(data).toLowerCase().trim();
  if (key === 'homely' && !connected) return '';
  return SOURCE_LABELS_HE[key] || data;
}

function PropertiesHeroAddButton() {
  const { connected } = useHomelyConnection();
  const dispatch = (action: "manual" | "import" | "homely") =>
    window.dispatchEvent(new CustomEvent("properties:add", { detail: { action } }));
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
        <DropdownMenuItem onClick={() => dispatch("manual")} className="gap-2">
          <Plus className="h-4 w-4" /> הוספת נכס ידנית
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch("import")} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> יבוא נכסים מאקסל
        </DropdownMenuItem>
        {connected && <DropdownMenuItem onClick={() => dispatch("homely")} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> סנכרון מלא מהומלי
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadsHeroAddButton() {
  const { connected } = useHomelyConnection();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const on = () => setBusy(true);
    const off = () => setBusy(false);
    window.addEventListener("leads:busy:on", on);
    window.addEventListener("leads:busy:off", off);
    return () => {
      window.removeEventListener("leads:busy:on", on);
      window.removeEventListener("leads:busy:off", off);
    };
  }, []);
  const dispatch = (action: "manual" | "import" | "homely" | "avatars") => {
    if (busy) return;
    window.dispatchEvent(new CustomEvent("leads:add", { detail: { action } }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={busy}
          className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-100"
          aria-label="הוספת ליד"
        >
          {busy ? (
            <Loader2 className="!h-5 !w-5 animate-spin" strokeWidth={2.5} />
          ) : (
            <Plus className="!h-5 !w-5" strokeWidth={2.5} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => dispatch("manual")} className="gap-2" disabled={busy}>
          <User className="h-4 w-4" /> הוספת ליד
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch("import")} className="gap-2" disabled={busy}>
          <FileSpreadsheet className="h-4 w-4" /> ייבוא לידים
        </DropdownMenuItem>
        {connected && <DropdownMenuItem onClick={() => dispatch("homely")} className="gap-2" disabled={busy}>
          <DownloadCloud className="h-4 w-4" /> משיכת לידים מ-Homely
        </DropdownMenuItem>}
        <DropdownMenuItem onClick={() => dispatch("avatars")} className="gap-2" disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> סנכרון תמונות פרופיל
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CampaignsHeroAddButton({ onBackToOrigin }: { onBackToOrigin?: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "published";
  const isCreate = tab === "create";
  const isCalendar = tab === "calendar";
  // When the composer was launched from the calendar, the back arrow must
  // strictly return there instead of the default sent feed.
  const cameFromCalendar = isCreate && (searchParams.has("schedule") || searchParams.has("properties"));
  const handleClick = () => {
    if (isCreate && onBackToOrigin) {
      onBackToOrigin();
      return;
    }
    if (isCalendar) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "published");
      next.delete("sub");
      setSearchParams(next, { replace: true });
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (isCreate && cameFromCalendar) {
      next.set("tab", "calendar");
      // Strip composer-only params so the calendar doesn't re-trigger.
      ["schedule", "listing", "properties", "variant", "variants"].forEach((k) => next.delete(k));
    } else {
      next.set("tab", isCreate ? "published" : "create");
    }
    next.delete("sub");
    setSearchParams(next, { replace: true });
  };
  const label = isCalendar
    ? "חזרה לדשבורד"
    : isCreate
      ? onBackToOrigin
        ? "חזרה למסך הקודם"
        : cameFromCalendar
        ? "חזרה ללוח השנה"
        : "חזרה לקמפיינים"
      : "יצירת קמפיין חדש";

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
    window.addEventListener("rz:campaigns-sync:done", done as EventListener);
    return () => window.removeEventListener("rz:campaigns-sync:done", done as EventListener);
  }, []);
  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent("rz:campaigns-sync"));
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
      <RefreshCw className={cn("!h-5 !w-5", busy && "animate-spin")} strokeWidth={2.5} />
    </Button>
  );
}

const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: "לוח שיווק שותפים" },
  { match: /^\/public-listings/, title: "לוח שיווק שותפים" },
  { match: /^\/my-ads/, title: "המודעות שלי" },
  { match: /^\/developer-dashboard/, title: "הפרויקטים שלנו" },
  { match: /^\/(command-center|tasks)/, title: "משימות" },
  { match: /^\/dashboard$/, title: "לוח בקרה" },
  { match: /^\/lead-crm/, title: "לידים" },
  { match: /^\/inbox/, title: "צ׳אטים" },
  { match: /^\/communication/, title: "צ׳אטים" },
  { match: /^\/deal-room/, title: "עסקאות" },
  { match: /^\/properties\/[^/]+/, title: "פרטי נכס" },
  { match: /^\/properties/, title: "הנכסים שלי" },
  { match: /^\/automations/, title: "Automation Studio" },
  { match: /^\/campaigns/, title: "פוסטים" },
  { match: /^\/posts/, title: "פוסטים" },
  { match: /^\/campaign-strategy/, title: "אסטרטגיית קמפיין" },
  { match: /^\/approval(-queue)?/, title: "אישור פרסומים" },
  { match: /^\/calendar/, title: "יומן תוכן" },
  { match: /^\/sms-blast/, title: "הפצת SMS" },
  { match: /^\/ads/, title: "מודעות" },
  { match: /^\/live-conversations/, title: "שיחות חיות" },
  { match: /^\/knowledge/, title: "מאגר הידע" },
  { match: /^\/ai-content/, title: "מחולל תוכן AI" },
  { match: /^\/sentiment/, title: "ניתוח סנטימנט" },
  { match: /^\/conversation-analytics/, title: "ניתוח שיחות" },
  { match: /^\/insights/, title: "Performance Insights" },
  { match: /^\/activity-log/, title: "יומן פעילות" },
  { match: /^\/subscription/, title: "ניהול חבילה" },
  { match: /^\/finance/, title: "חיובים וחשבוניות" },
  { match: /^\/social-connect/, title: "חיבור רשתות חברתיות" },
  { match: /^\/api-settings/, title: "הגדרות API ותשתיות" },
  { match: /^\/super-admin/, title: "ממשק ניהול על" },
  { match: /^\/security/, title: "אבטחה" },
  { match: /^\/privacy/, title: "פרטיות וציות" },
  { match: /^\/team/, title: "ניהול צוות" },
  { match: /^\/partner\/posts/, title: "פוסטים" },
  { match: /^\/partner\/chats/, title: "צ׳אטים" },
  { match: /^\/partner\/contacts/, title: "לידים" },
  { match: /^\/affiliate-pricing/, title: "חבילות שותפים" },
  { match: /^\/affiliate-network/, title: "שיווק שותפים" },
  { match: /^\/affiliate$/, title: "שיווק שותפים" },

  { match: /^\/settings\/branding/, title: "מיתוג הסוכנות" },
  { match: /^\/settings\/system-health/, title: "תקינות המערכת" },
  { match: /^\/leads/, title: "פניות נכנסות" },
  { match: /^\/profile/, title: "הגדרות" },
  { match: /^\/billing/, title: "חבילה וחשבוניות" },
  { match: /^\/wallet/, title: "הארנק שלי" },
  { match: /^\/auth/, title: "התחברות" },
];

function resolvePageTitle(pathname: string): string {
  return ROUTE_TITLES.find((r) => r.match.test(pathname))?.title ?? "";
}

/** Only super admins and the official platform owners see the wallet balance. */
const BALANCE_OWNER_EMAILS = [
  "sgalili@gmail.com",
  "udi@udiman.com",
  "udi.vitman@gmail.com",
  "udivitman@gmail.com",
];

export function PageHero() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isPartnerMode } = useAppMode();
  const isPublicBoard = location.pathname === "/" || location.pathname.startsWith("/public-listings");
  const isMyAdsPage = location.pathname.startsWith("/my-ads");
  const myListingsPath = "/my-ads";
  const { isSuperAdmin, isAffiliate, isTeamMember, isPropertyOwner } = useUserRole();
  const { activeWorkspaceId } = useWorkspace();
  const { data: ownerAds = [] } = useQuery({
    queryKey: ['my-ads-stats', user?.id, activeWorkspaceId],
    enabled: isPublicBoard && !!user && isPropertyOwner && !isAffiliate && !isTeamMember && !!activeWorkspaceId,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_my_ads_stats'); if (error) throw error; return data ?? []; },
  });
  const canSeeMyAds = isAffiliate || isTeamMember || (isPropertyOwner && ownerAds.length > 0);
  const { preferences: affiliatePrefs } = useAffiliatePreferences();
  const automationAnyOn = Boolean(affiliatePrefs.rita_auto_mode || affiliatePrefs.auto_funnel_enabled);
  const canSeeBalance = isSuperAdmin || BALANCE_OWNER_EMAILS.includes((user?.email ?? "").toLowerCase());
  const title = resolvePageTitle(location.pathname);
  const isPostsPage = location.pathname.startsWith("/campaigns") || location.pathname.startsWith("/posts");
  const isPropertyDetail = /^\/properties\/[^/]+/.test(location.pathname);
  // Remember where the user came from for this page, even after in-page
  // query changes (tabs) drop router state.
  const [origin, setOrigin] = React.useState<{ path: string; ret: ReturnState } | null>(null);
  React.useEffect(() => {
    const ret = readReturn(location.state);
    if (ret) setOrigin({ path: location.pathname, ret });
    else setOrigin((o) => (o && o.path === location.pathname ? o : null));
  }, [location.pathname, location.state]);
  React.useEffect(() => {
    const y = (location.state as ReturnState | null)?.restoreScroll;
    if (typeof y !== "number") return;
    const ts = [50, 300, 800].map((d) => window.setTimeout(() => window.scrollTo({ top: y }), d));
    return () => ts.forEach(clearTimeout);
  }, [location.key]);
  const goBackToOrigin = () => {
    if (!origin) return;
    navigate(origin.ret.returnTo!, { state: { restoreScroll: origin.ret.returnScroll ?? 0 } });
  };
  const propertySuffix = usePropertyHeroSuffix(location.pathname);
  const campaignsTab = searchParams.get("tab") ?? "published";
  const isCampaignsCreate = isPostsPage && campaignsTab === "create";
  const isCampaignsCalendar = isPostsPage && campaignsTab === "calendar";
  // Property-detail title renders strictly as "פרטי נכס" — no external source
  // suffix (Homely/Webtiv/Yad2/etc.) is appended.
  void propertySuffix;
  void isPropertyDetail;
  const displayTitle = isCampaignsCreate ? "פרסום פוסט חדש" : isCampaignsCalendar ? "פרסומים מתוזמנים" : title;
  const [inboxChatOpen, setInboxChatOpen] = React.useState(
    location.pathname.startsWith('/inbox') && !!(searchParams.get('chat') || searchParams.get('lead')),
  );

  React.useEffect(() => {
    if (!location.pathname.startsWith('/inbox')) {
      setInboxChatOpen(false);
      return;
    }
    setInboxChatOpen(!!(searchParams.get('chat') || searchParams.get('lead')));
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setInboxChatOpen(detail?.open === true);
    };
    window.addEventListener('realtyz:inbox-chat-state', update);
    return () => window.removeEventListener('realtyz:inbox-chat-state', update);
  }, [location.pathname, searchParams]);

  // On /campaigns with a lead context, CampaignCenter renders its own
  // avatar+name hero — skip the default hero to avoid a stacked duplicate.
  // The shared board has no blue title banner; the header carries its actions.
  if (isPublicBoard) return null;
  if (
    isPostsPage &&
    (searchParams.get("lead") || searchParams.get("client") || searchParams.get("voter"))
  ) {
    return null;
  }

  return (
    <div
      dir="rtl"
      data-page-hero
      className="relative w-full shrink-0 overflow-hidden text-white print:hidden mb-0"
      style={{ backgroundColor: "#0b3982" }}
    >
      {/* 3-zone toolbar — title is absolutely centered to the viewport so it
          stays perfectly centered regardless of side controls' widths. */}
      <div
        className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6"
        style={{ minHeight: "65px", paddingTop: "10px", paddingBottom: "10px" }}
      >
        {/* Visual right (RTL flex start): Burger / nav toggle + AI response + optional history */}
        <div className="flex items-center gap-1">
          {location.pathname.startsWith('/wallet') && <UsagePriceListButton />}
          {(location.pathname === '/affiliate' || location.pathname.startsWith('/affiliate-network')) && <AffiliateProgramHelp />}
          {isMyAdsPage && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => navigate("/public-listings")}
              aria-label="חזרה ללוח שיווק שותפים"
              title="חזרה ללוח שיווק שותפים"
              className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="!h-5 !w-5 -scale-x-100" strokeWidth={2.5} />
            </Button>
          )}
          {(isPostsPage || location.pathname.startsWith("/inbox")) && (
            <AiResponseToggle />
          )}
          {/* Yad2 scraping balance — owners / super admins, and ONLY on /properties. */}
          {canSeeBalance && location.pathname.startsWith("/properties") && <BrightDataHeroPill />}
          {isPublicBoard && user && canSeeMyAds && (
            <Button
              asChild
              variant="link"
              className="h-auto gap-0 p-0 text-sm font-semibold text-white hover:text-white/90"
            >
              <Link to={myListingsPath}>
                <ChevronRight className="!h-4 !w-4" strokeWidth={2.5} />
                המודעות שלי
              </Link>
            </Button>
          )}
        </div>

        {/* Absolute-centered page title — locked to screen center */}
        <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-xl font-bold tracking-tight text-white sm:text-2xl">
          {displayTitle}
        </h1>

        {/* Visual left (RTL flex end): page-specific action button */}
        <div className="relative z-30 flex items-center justify-end gap-2" style={{ marginLeft: "-5px" }}>
          {location.pathname.startsWith('/wallet') && <Button size="icon" variant="ghost" onClick={() => {
            const returnTo = location.state?.walletReturnTo;
            if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/wallet')) navigate(returnTo);
            else if (window.history.state?.idx > 0) navigate(-1);
            else navigate('/public-listings');
          }} aria-label="חזרה לעמוד הקודם" title="חזרה לעמוד הקודם" className="h-9 w-9 rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"><ChevronLeft className="!h-5 !w-5" strokeWidth={2.5} /></Button>}
          {(isPublicBoard || isMyAdsPage) && <PublicListingPublisher autoResume />}
          {isPublicBoard && !user && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate('/auth', {
                  state: { returnTo: location.pathname + location.search },
                })
              }
              aria-label="הרשמה או התחברות"
              className="h-8 border-0 bg-transparent px-1 text-sm font-semibold text-primary-foreground shadow-none hover:bg-transparent hover:text-primary-foreground/80"
            >
              הרשמה / התחברות
            </Button>
          )}
          {/^\/affiliate(\/|$)/.test(location.pathname) || location.pathname.startsWith("/affiliate-network") ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => navigate("/wallet", { state: { walletReturnTo: location.pathname + location.search } })}
              aria-label="הארנק שלי"
              title="הארנק שלי"
              className="h-9 w-9 rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              <Wallet className="!h-5 !w-5" strokeWidth={2.5} />
            </Button>
          ) : null}
          {location.pathname.startsWith('/inbox') && inboxChatOpen && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                window.dispatchEvent(new Event('realtyz:inbox-back'));
                navigate('/inbox', { replace: true });
              }}
              aria-label="חזרה לרשימת השיחות"
              title="חזרה לרשימת השיחות"
              className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="!h-5 !w-5" strokeWidth={2.5} />
            </Button>
          )}
          {location.pathname === "/properties" && <PropertiesHeroAddButton />}
          {location.pathname === "/developer-dashboard" && (
            <Button size="icon" variant="ghost" aria-label="הוספת פרויקט" title="הוספת פרויקט"
              className="h-9 w-9 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={() => window.dispatchEvent(new Event('developer-projects:add'))}>
              <Plus className="!h-5 !w-5" strokeWidth={2.5} />
            </Button>
          )}
          {location.pathname.startsWith("/lead-crm") && <LeadsHeroAddButton />}
          {isPostsPage && !isCampaignsCreate && <CampaignsHeroSyncButton />}
          {isPostsPage && <CampaignsHeroAddButton onBackToOrigin={origin ? goBackToOrigin : undefined} />}
          {origin && !isPropertyDetail && !isPostsPage && (
            <Button
              size="icon"
              variant="ghost"
              onClick={goBackToOrigin}
              aria-label="חזרה למסך הקודם"
              title="חזרה למסך הקודם"
              className="h-10 w-10 rounded-full text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="!h-6 !w-6" strokeWidth={2.5} />
            </Button>
          )}
          {isPropertyDetail && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
                navigate(returnTo || "/properties");
              }}
              aria-label="חזרה למסך הקודם"
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
        <RealtyzWave position="bottom" variant="wave-soft" fill="#0b3982" seed={7} />
      </div>
    </div>
  );
}

export default PageHero;
