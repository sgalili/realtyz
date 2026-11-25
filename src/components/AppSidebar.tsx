import { cn } from "@/lib/utils";
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';
import { BROKER_NAV_PATHS } from '@/lib/brokerNavigation';
import { Button } from '@/components/ui/button';
import { APP_TOUR_EVENT } from '@/lib/appWalkthrough';
import { HelpHint } from "@/components/tutorial/TutorialHost";
import { useMemo } from 'react';
import {
  Megaphone,
  MessageCircle,
  Home,
  Building2,
  Handshake,
  ClipboardList,
  HelpCircle,
  LogIn,
  UserPlus,
  Gift,
  Coins,
  Globe,
  Settings,
  Mail,
  Eye,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from '@/lib/router-compat';
import { returnState } from '@/lib/returnNav';
import { useAuth } from '@/hooks/useAuth';
import { SidebarWalletIndicator } from '@/components/billing/SidebarWalletIndicator';
import { useUserRole } from '@/hooks/useUserRole';
import { usePropertyPageAccess } from '@/hooks/usePropertyPageAccess';
import { accountIdentity } from '@/lib/accountMode';
import { activityAudience } from '@/lib/activityAudience';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,

  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarIntelInput } from '@/components/SidebarIntelInput';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';
import { friendlyUserDisplayName } from '@/lib/friendlyUserDisplayName';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { AppModeSwitcher } from '@/components/header/AppModeSwitcher';
import { useAppMode } from '@/hooks/useAppMode';
import { AffiliateFlowchartIcon } from '@/components/icons/AffiliateFlowchartIcon';
import { useAccountIdentity } from '@/hooks/useAccountIdentity';
import { SidebarRitaChat } from '@/components/sidebar/SidebarRitaChat';
import { AccessibilityMenu } from '@/components/accessibility/AccessibilityMenu';
import { Accessibility, FileSignature } from 'lucide-react';
import { usePersonalLanguage } from '@/i18n/personalLanguage';
import { Megaphone as MyAdsIcon, Building2 as ClientsIcon } from 'lucide-react';


type NavItem = {
  title: string;
  url: string;
  icon: ComponentType<LucideProps>;
  iconColor: string;
  badgeClass: string;
  aliases?: string[];
  badge?: string;
};

const OUR_CLIENTS_ITEM: NavItem = {
  title: 'הלקוחות שלנו',
  url: '/our-clients',
  icon: ClientsIcon,
  iconColor: 'text-primary',
  badgeClass: 'bg-primary/10 text-primary ring-primary/20',
};

const MY_ADS_ITEM: NavItem = {
  title: 'המודעות שלי',
  url: '/my-ads',
  icon: MyAdsIcon,
  iconColor: 'text-primary',
  badgeClass: 'bg-primary/10 text-primary ring-primary/20',
};

/**
 * Each destination owns a unique semantic icon token independent of text inheritance.
 */
const NAV_ITEMS: NavItem[] = [
  {
    title: 'מטלות\n',
    url: '/command-center',
    icon: ClipboardList,
    iconColor: '!text-[hsl(var(--nav-tasks))]', // sky-700
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    aliases: ['/tasks'],
  },
  {
    title: 'חתימות דיגיטליות',
    url: '/signatures',
    icon: FileSignature,
    iconColor: '!text-[hsl(var(--nav-deals))]',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  {
    title: 'קמפיינים',
    url: '/campaigns',
    icon: Megaphone,
    iconColor: '!text-[hsl(var(--nav-posts))]', // orange-700
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    aliases: ['/broadcast', '/automations', '/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'],
  },
  {
    title: 'הנכסים שלי',
    url: '/properties',
    icon: Home,
    iconColor: '!text-[hsl(var(--nav-properties))]', // amber-700
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    aliases: ['/property', '/listings'],
  },
  {
    title: 'יזמים',
    url: '/developers',
    icon: Building2,
    iconColor: '!text-[hsl(var(--nav-developers))]', // slate-700
    badgeClass: 'bg-slate-50 text-slate-700 ring-slate-200',
  },
  {
    title: 'צ׳אטים/קהילה',
    url: '/inbox',
    icon: MessageCircle,
    iconColor: '!text-[hsl(var(--nav-chats))]', // cyan-700
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    aliases: ['/communication'],
  },
  {
    title: 'עסקאות',
    url: '/deal-room',
    icon: Handshake,
    iconColor: '!text-[hsl(var(--nav-deals))]', // rose-700
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
    aliases: ['/deals'],
  },
  {
    title: 'שיווק שותפים',
    url: '/affiliate-network',
    icon: AffiliateFlowchartIcon,
    iconColor: '!text-[hsl(var(--nav-partners))]', // violet-700
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    title: 'הזמן חברים',
    url: '/referral',
    icon: Gift,
    iconColor: '!text-[hsl(var(--nav-invite))]', // teal-700
    badgeClass: 'bg-teal-50 text-teal-700 ring-teal-200',
  },
];

/**
 * Partner ("שותף") mode navigation: only the affiliate surfaces — shared
 * listings to promote, the partner network and the referral/rewards screen.
 * Broker-only CRM tooling is hidden entirely.
 */
const PARTNER_NAV_ITEMS: NavItem[] = [
  {
    title: 'שיווק שותפים',
    url: '/affiliate-network',
    icon: AffiliateFlowchartIcon,
    iconColor: '!text-[hsl(var(--nav-partners))]', // violet-700
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    title: 'צ׳אטים/קהילה',
    url: '/partner/chats',
    icon: MessageCircle,
    iconColor: '!text-[hsl(var(--nav-chats))]', // cyan-700
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  },
  {
    title: 'קמפיינים',
    url: '/posts',
    icon: Megaphone,
    iconColor: '!text-[hsl(var(--nav-properties))]', // amber-700
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  {
    title: 'הזמן חברים',
    url: '/referral',
    icon: Gift,
    iconColor: '!text-[hsl(var(--nav-invite))]', // teal-700
    badgeClass: 'bg-teal-50 text-teal-700 ring-teal-200',
  },
];

export function AppSidebar({ tutorialHighlightPath }: { tutorialHighlightPath?: string | null }) {
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();

  /** Collapse the sidebar on both mobile (sheet) and desktop (offcanvas). */
  const closeSidebar = () => {
    setOpenMobile(false);
    setOpen(false);
  };
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, isSuperAdmin, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, isDeveloper, loading: roleLoading, error: roleError } = useUserRole();
  const { settings } = useWhiteLabel();
  const { data: counts } = useSidebarCounts();
  const { isPartnerMode } = useAppMode();
  const brokersOnly = useBrokersOnly();
  const demo = usePublicWorkspace();
  const identity = useAccountIdentity();
  const { gender } = usePersonalLanguage();

  // Navigation follows the ACTIVE workspace: Rita's marketing workspace hides
  // properties, deals and partners; every other workspace shows them all.
  // In partner ("שותף") mode — or for an affiliate-only account — only the
  // affiliate screens are listed.
  const features = useWorkspaceFeatures();
  const access = usePropertyPageAccess();
  const affiliateOnlyNav = isAffiliateOnly || isPartnerMode;
  const audience = activityAudience(roles, isPartnerMode);
  const brokerMenu = audience === 'professional' && !access.projects;
  const allNavItems = useMemo(() => {
    if (roleLoading || roleError) return [];
    // Marketing companies manage marketing for several developers at once.
    if (roles.includes('marketing_company') && !isPartnerMode) {
      const pick = ['/campaigns', '/posts', '/inbox', '/referral'];
      return [OUR_CLIENTS_ITEM, MY_ADS_ITEM, ...pick.map(u => NAV_ITEMS.find(i => i.url === u)).filter((i): i is NavItem => !!i)];
    }
    if (audience !== 'professional') {
      const personal = NAV_ITEMS.filter(item => ['/command-center', '/deal-room', '/referral'].includes(item.url));
      const communications = audience === 'partner' ? PARTNER_NAV_ITEMS.filter(item => ['/posts', '/partner/chats'].includes(item.url)) : NAV_ITEMS.filter(item => ['/campaigns', '/inbox'].includes(item.url));
      return [...personal, ...communications];
    }
    // My Properties stays reachable for every signed-in account (owner login or Super Admin workspace entry).
    const invite = NAV_ITEMS.filter((item) => item.url === '/properties' || item.url === '/referral');
    // A broker-owned active workspace shows the broker menu even when the
    // viewer's own account is private/owner-only (identity follows the owner).
    const brokerWorkspace = access.properties;
    if (!brokerWorkspace && (isPropertySeekerOnly || accountIdentity(roles).label === 'פרטי')) return invite;
    if (!brokerWorkspace && isPropertyOwnerOnly) return invite; // owner properties live inside My Ads
    // Developers get the shared ecosystem (tasks, posts, contacts, chats, partners)
    // but broker-only tools (Yad2 broker inventory, deal room, developer directory)
    // are swapped for their own project management dashboard.
    if (access.projects) {
      const base = NAV_ITEMS.filter((i) => !['/deal-room', '/developers', '/dashboard', '/affiliate-network', '/signatures'].includes(i.url));
      const projects = NAV_ITEMS.find((i) => i.url === '/developers');
      return projects ? [{ ...projects, title: 'הפרויקטים שלנו', url: '/developer-dashboard' }, ...base] : base;
    }
    const availableItems = [...NAV_ITEMS, MY_ADS_ITEM];
    return BROKER_NAV_PATHS
      .map((path) => availableItems.find((item) => item.url === path))
      .filter((item): item is NavItem => {
        if (!item) return false;
        return true;
      });
  }, [audience, features, access.projects, access.properties, affiliateOnlyNav, roles, isPropertyOwnerOnly, isPropertySeekerOnly, isDeveloper, isSuperAdmin, roleLoading, roleError, identity.label, isPartnerMode]);
  // Brokers-only SaaS hides partner/affiliate and referral-reward screens (code and data stay intact).
  const navItems = useMemo(() => {
    const filtered = brokersOnly ? allNavItems.filter(i => (!demo || i.url !== '/referral') && (!['/affiliate-network', '/partner/chats', '/partner/contacts', '/sharing-pool', '/posts'].includes(i.url) || (i.url === '/posts' && !PARTNER_NAV_ITEMS.includes(i)))) : allNavItems;
    if (!brokersOnly) return filtered;
    const cleaned = filtered.map(i => i.url === '/inbox' ? { ...i, title: 'צ׳אטים' } : i);
    if (!brokerMenu) return cleaned;
    // Brokers-only: My Ads is hidden; the single entry opens Campaigns directly.
    const camp = cleaned.find(i => i.url === '/campaigns');
    const idx = cleaned.findIndex(i => i.url === '/campaigns' || i.url === '/my-ads');
    if (idx < 0) return cleaned;
    const rest = cleaned.filter(i => i.url !== '/campaigns' && i.url !== '/my-ads');
    const hub: NavItem = { ...(camp ?? MY_ADS_ITEM), title: 'קמפיינים', url: '/campaigns', aliases: ['/my-ads', '/publishing', ...(camp?.aliases ?? [])] };
    rest.splice(Math.min(idx, rest.length), 0, hub);
    // Brokers-only: chats sit directly above tasks.
    const chatsAt = rest.findIndex(i => i.url === '/inbox');
    const tasksAt = rest.findIndex(i => i.url === '/command-center');
    if (chatsAt > tasksAt && tasksAt >= 0) {
      const [chats] = rest.splice(chatsAt, 1);
      rest.splice(tasksAt, 0, chats!);
    }
    return rest;
  }, [allNavItems, brokersOnly, brokerMenu, demo]);

  const countFor = (url: string): number | undefined => {
    if (!counts || audience !== 'professional') return undefined;
    switch (url) {
      case '/command-center': return counts.tasks;
      case '/lead-crm': return counts.leads;
      case '/properties': return counts.listings;
      case '/developer-dashboard': return counts.projects;
      case '/inbox': return counts.chats;
      case '/deal-room': return counts.deals;
      case '/campaigns': return counts.campaigns;
      // Partner mode: live shared properties, and total invitations sent.
      case '/affiliate-network': return affiliateOnlyNav ? counts.sharedListings : undefined;
      case '/referral': return affiliateOnlyNav ? counts.invitations : undefined;
      default: return undefined;
    }
  };

  const formatCount = (n: number) =>
    n > 999 ? `${(n / 1000).toFixed(2).replace(/\.?0+$/, '')}k` : String(n);

  const handleNavClick = () => {
    closeSidebar();
  };

  const isActive = (item: NavItem) =>
    location.pathname === item.url ||
    item.aliases?.some((a) => location.pathname === a || location.pathname.startsWith(a + '/'));

  // The top identity area shows the signed-in user's profile avatar and keeps
  // the active workspace switcher next to it; identity clicks open a public profile.


  return (
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu gap-0 pt-3">
        {!collapsed && !user && brokersOnly && <div data-visitor-auth-actions className="mb-3 grid grid-cols-2 gap-2 px-3">
          <Button asChild className="min-h-12 gap-2 text-base"><NavLink to="/auth?mode=signup" onClick={handleNavClick}><UserPlus className="h-5 w-5" aria-hidden="true" />הרשמה חינם</NavLink></Button>
          <Button asChild variant="outline" className="min-h-12 gap-2 border-primary text-base text-primary hover:bg-primary/10"><NavLink to="/auth?mode=login" onClick={handleNavClick}><LogIn className="h-5 w-5" aria-hidden="true" />התחברות</NavLink></Button>
        </div>}
        {!collapsed && user && <SidebarWalletIndicator />}
        {/* TOP: ACTIVE WORKSPACE identity + switcher (never the personal profile) */}
        {!collapsed && user && (
          <SidebarGroup className="p-0 border-b border-slate-200">
            <SidebarGroupContent
              role="button"
              tabIndex={0}
              title="פרופיל ציבורי"
              onClick={() => {
                closeSidebar();
                navigate(`/broker/${user.id}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  closeSidebar();
                  navigate(`/broker/${user.id}`);
                }
              }}
              className="cursor-pointer px-3 py-3 transition-colors hover:bg-slate-50"
            >
              <div onClick={(e) => e.stopPropagation()}>
                <WorkspaceSwitcher />
              </div>

              {/* Settings + Tutorial + broker/partner toggle share one row. */}
              <div className={cn("mt-2 grid w-full items-stretch gap-1", identity.canSwitch && !brokersOnly ? "grid-cols-[1fr_1fr_1.8fr]" : "grid-cols-2")} dir="rtl" onClick={(e) => e.stopPropagation()}>
                {/* Settings shortcut: opens /profile and closes the sidebar.
                    Hidden in Rita's marketing workspace. */}
                {(
                  <Button
                    variant="outline"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSidebar();
                      navigate('/profile');
                    }}
                    title="הגדרות"
                    aria-label="הגדרות"
                    className="h-9 w-full min-w-0 gap-1 px-1 text-[6px] font-semibold"
                  >
                    <Settings className="h-4 w-4 text-[hsl(var(--nav-settings))]" />
                    הגדרות
                  </Button>
                )}

                <Button variant="outline" type="button" disabled={roleLoading || roleError}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new Event(APP_TOUR_EVENT));
                    closeSidebar();
                  }}
                  title="הדרכה" aria-label="הדרכה"
                  className="h-9 w-full min-w-0 gap-1 px-1 text-[6px] font-semibold">
                  <HelpCircle className="h-4 w-4 text-[hsl(var(--nav-help))]" />הדרכה
                </Button>

                {identity.canSwitch && !brokersOnly && <AppModeSwitcher keepSidebarOpen className="w-full min-w-0 [&>button]:h-[31px] [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-0.5 [&>button]:!text-sm" />}
              </div>

            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Shared public board: always the first menu entry. */}
              {!user && brokersOnly && <>
                <SidebarMenuItem><SidebarMenuButton asChild><NavLink to="/" onClick={handleNavClick} className="flex items-center gap-3 px-3 py-2.5"><Home className="h-4 w-4 text-primary" /><span className="text-sm font-medium">דף הבית</span></NavLink></SidebarMenuButton></SidebarMenuItem>
              </>}
              {!user && <SidebarMenuItem><SidebarMenuButton asChild>{brokersOnly ? <a href="/demo/broker/properties" className="flex items-center gap-3 px-3 py-2.5"><Eye className="h-4 w-4 text-primary" /><span className="text-sm font-medium">מרחב הדגמה</span></a> : <NavLink to="/demo" onClick={handleNavClick} className="flex items-center gap-3 px-3 py-2.5"><Eye className="h-4 w-4 text-primary" />{!collapsed && <span className="text-sm font-medium">מרחב הדגמה</span>}</NavLink>}</SidebarMenuButton></SidebarMenuItem>}
              {!user && brokersOnly && <SidebarMenuItem><SidebarMenuButton asChild><NavLink to="/faq" onClick={handleNavClick} className="flex items-center gap-3 px-3 py-2.5"><HelpCircle className="h-4 w-4 text-primary" /><span className="text-sm font-medium">שאלות ותשובות</span></NavLink></SidebarMenuButton></SidebarMenuItem>}
              {/* Brokers-only SaaS hides the shared public board entry (route and data stay for full_marketplace). */}
              {!brokersOnly && <SidebarMenuItem key="public-listings">
                <SidebarMenuButton asChild isActive={location.pathname === '/' || location.pathname.startsWith('/public-listings')}>
                  <NavLink
                    to="/public-listings"
                    data-walkthrough-path="/public-listings"
                    data-walkthrough-title="לוח נדל״ן שיתופי"
                    onClick={handleNavClick}
                    className="group flex items-center gap-3 px-3 pl-8 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                    activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200"
                  >
                    <Globe className="h-4 w-4 shrink-0 !text-[hsl(var(--nav-board))]" />
                    {!collapsed && <span className="text-sm font-medium">לוח השותפים של המדינה</span>}
                  </NavLink>
                </SidebarMenuButton>
                {!collapsed && <HelpHint path="/public-listings" className="absolute left-1 top-1/2 -translate-y-1/2" />}
              </SidebarMenuItem>}
              {user && audience === 'partner' && !brokersOnly && (
                <SidebarMenuItem key="partner-pool">
                  <SidebarMenuButton asChild><NavLink to="/sharing-pool" onClick={handleNavClick} className="flex items-center gap-3 px-3 py-2.5"><Home className="h-4 w-4 text-primary" />{!collapsed && <span className="text-sm font-medium">נכסים פתוחים לשיתוף</span>}</NavLink></SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {user && !brokerMenu && (
                <SidebarMenuItem key="my-ads">
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith('/my-ads')}>
                    <NavLink to="/my-ads" data-walkthrough-path="/my-ads" data-walkthrough-title="המודעות שלי" onClick={handleNavClick}
                      className="group flex items-center gap-3 px-3 pl-8 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                      activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200">
                      <MyAdsIcon className="h-4 w-4 shrink-0 text-primary" />
                      {!collapsed && <span className="text-sm font-medium">המודעות שלי</span>}
                    </NavLink>
                  </SidebarMenuButton>
                  {!collapsed && <HelpHint path="/my-ads" className="absolute left-1 top-1/2 -translate-y-1/2" />}
                </SidebarMenuItem>
              )}
              {(brokersOnly && !user ? [] : navItems).map((item) => {
                const active = isActive(item);
                const tutorialActive =
                  tutorialHighlightPath === item.url ||
                  item.aliases?.includes(tutorialHighlightPath ?? '');
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        state={item.url === '/developer-dashboard' ? returnState() : undefined}
                        data-walkthrough-path={item.url}
                        data-walkthrough-title={item.title.trim()}
                        end={item.url === '/command-center'}
                        onClick={handleNavClick}
                        className={`group flex items-center gap-3 px-3 pl-8 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all ${tutorialActive ? 'realtyz-tutorial-nav-glow' : ''}`}
                        activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200"
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${item.iconColor}`} />
                        {!collapsed && <span className="text-sm font-medium">{gender === 'female' && item.title === 'הזמן חברים' ? 'הזמיני חברים' : item.title}</span>}
                        {!collapsed && item.badge && (
                          <span className="ms-auto rounded-full bg-background px-2.5 py-0.5 text-xs font-bold leading-none text-foreground ring-1 ring-border">
                            {item.badge}
                          </span>
                        )}
                        {!collapsed && !item.badge && (() => {
                          const c = countFor(item.url);
                          if (c === undefined || (c === 0 && item.url !== '/developer-dashboard')) return null;
                          return (
                            <span className="ms-auto rounded-full bg-background px-2 py-0.5 text-[11px] font-bold leading-none text-foreground ring-1 ring-border">
                              {formatCount(c)}
                            </span>
                          );
                        })()}
                      </NavLink>
                    </SidebarMenuButton>
                    {!collapsed && <HelpHint path={item.url} className="absolute left-1 top-1/2 -translate-y-1/2" />}
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem key="accessibility">
                <AccessibilityMenu trigger={
                  <SidebarMenuButton
                    type="button"
                    aria-label="פתיחת תפריט נגישות"
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                  >
                    <Accessibility className="h-4 w-4 shrink-0 text-primary" />
                    {!collapsed && <span className="text-sm font-medium">נגישות</span>}
                  </SidebarMenuButton>
                } />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
      {!collapsed && user && <SidebarFooter className="shrink-0 gap-0 border-t border-border bg-background p-0 shadow-none">
        <SidebarRitaChat />
      </SidebarFooter>}
    </Sidebar>
  );
}
