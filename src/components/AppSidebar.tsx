import { History } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { APP_TOUR_EVENT } from '@/lib/appWalkthrough';
import { HelpHint } from "@/components/tutorial/TutorialHost";
import { useMemo } from 'react';
import {
  Activity,
  Megaphone,
  MessageCircle,
  Home,
  Building2,
  Handshake,
  ClipboardList,
  HelpCircle,
  Gift,
  Coins,
  Globe,
  Settings,
  Mail,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SidebarWalletIndicator } from '@/components/billing/SidebarWalletIndicator';
import { useUserRole } from '@/hooks/useUserRole';
import { usePropertyPageAccess } from '@/hooks/usePropertyPageAccess';
import { accountIdentity } from '@/lib/accountMode';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { SuperAdminLeadAlert } from '@/components/admin/SuperAdminLeadAlert';
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
import { usePersonalLanguage } from '@/i18n/personalLanguage';
import { Megaphone as MyAdsIcon } from 'lucide-react';


type NavItem = {
  title: string;
  url: string;
  icon: ComponentType<LucideProps>;
  iconColor: string;
  badgeClass: string;
  aliases?: string[];
  badge?: string;
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
    title: 'לוח בקרה',
    url: '/dashboard',
    icon: Activity,
    iconColor: '!text-[hsl(var(--nav-dashboard))]', // indigo-700
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
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
    title: 'נכסים',
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
    title: 'צ׳אטים',
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
    title: 'צ׳אטים',
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
  const identity = useAccountIdentity();
  const { gender } = usePersonalLanguage();

  // Navigation follows the ACTIVE workspace: Rita's marketing workspace hides
  // properties, deals and partners; every other workspace shows them all.
  // In partner ("שותף") mode — or for an affiliate-only account — only the
  // affiliate screens are listed.
  const features = useWorkspaceFeatures();
  const access = usePropertyPageAccess();
  const affiliateOnlyNav = isAffiliateOnly || isPartnerMode;
  const navItems = useMemo(() => {
    if (roleLoading || roleError) return [];
    if (affiliateOnlyNav) return PARTNER_NAV_ITEMS.filter(item => item.url !== '/affiliate-network');
    const invite = NAV_ITEMS.filter((item) => item.url === '/referral');
    // A broker-owned active workspace shows the broker menu even when the
    // viewer's own account is private/owner-only (identity follows the owner).
    const brokerWorkspace = identity.label === 'מתווך';
    if (!brokerWorkspace && (isPropertySeekerOnly || accountIdentity(roles).label === 'פרטי')) return invite;
    if (!brokerWorkspace && isPropertyOwnerOnly) return invite; // owner properties live inside My Ads
    // Developers get the shared ecosystem (tasks, posts, contacts, chats, partners)
    // but broker-only tools (Yad2 broker inventory, deal room, developer directory)
    // are swapped for their own project management dashboard.
    if (access.projects) {
      const base = NAV_ITEMS.filter((i) => !['/properties', '/deal-room', '/developers', '/dashboard', '/affiliate-network'].includes(i.url));
      const projects = NAV_ITEMS.find((i) => i.url === '/developers');
      return projects ? [{ ...projects, title: 'הפרויקטים שלנו', url: '/developer-dashboard' }, ...base] : base;
    }
    return NAV_ITEMS.filter((item) => {
      if (item.url === '/developers') return isDeveloper;
      if (item.url === '/properties') return features.listingsEnabled && access.properties;
      if (item.url === '/deal-room') return features.dealsEnabled;
      if (item.url === '/affiliate-network') return false;
      return true;
    });
  }, [features, access.projects, access.properties, affiliateOnlyNav, roles, isPropertyOwnerOnly, isPropertySeekerOnly, isDeveloper, isSuperAdmin, roleLoading, roleError, identity.label]);

  const countFor = (url: string): number | undefined => {
    if (!counts) return undefined;
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
  // the active workspace switcher next to it; clicking the avatar goes to /profile.


  return (
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu gap-0 pt-3">
        {!collapsed && user && <SidebarWalletIndicator />}
        {/* TOP: ACTIVE WORKSPACE identity + switcher (never the personal profile) */}
        {!collapsed && user && (
          <SidebarGroup className="p-0 border-b border-slate-200">
            <SidebarGroupContent
              role="button"
              tabIndex={0}
              title="הגדרות"
              onClick={() => {
                closeSidebar();
                navigate('/profile');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  closeSidebar();
                  navigate('/profile');
                }
              }}
              className="cursor-pointer px-3 py-3 transition-colors hover:bg-slate-50"
            >
              <div onClick={(e) => e.stopPropagation()}>
                <WorkspaceSwitcher />
              </div>

              {/* Settings + Tutorial + broker/partner toggle share one row. */}
              <div className={cn("mt-2 grid w-full items-stretch gap-1", identity.canSwitch ? "grid-cols-[1fr_1fr_1.8fr]" : "grid-cols-2")} dir="rtl" onClick={(e) => e.stopPropagation()}>
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

                {identity.canSwitch && <AppModeSwitcher keepSidebarOpen className="w-full min-w-0 [&>button]:h-[31px] [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-0.5 [&>button]:!text-sm" />}
              </div>

            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Shared public board: always the first menu entry. */}
              <SidebarMenuItem key="public-listings">
                <SidebarMenuButton asChild isActive={location.pathname === '/' || location.pathname.startsWith('/public-listings')}>
                  <NavLink
                    to="/public-listings"
                    data-walkthrough-path="/public-listings"
                    data-walkthrough-title="לוח נדל״ן שיתופי"
                    onClick={handleNavClick}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                    activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200"
                  >
                    <Globe className="h-4 w-4 shrink-0 !text-[hsl(var(--nav-board))]" />
                    {!collapsed && <span className="text-sm font-medium">לוח נדל״ן שיתופי</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user && (
                <SidebarMenuItem key="my-ads">
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith('/my-ads')}>
                    <NavLink to="/my-ads" data-walkthrough-path="/my-ads" data-walkthrough-title="המודעות שלי" onClick={handleNavClick}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                      activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200">
                      <MyAdsIcon className="h-4 w-4 shrink-0 text-primary" />
                      {!collapsed && <span className="text-sm font-medium">המודעות שלי</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {user && (
                <SidebarMenuItem key="activity-history">
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith('/activity-history')}>
                    <NavLink to="/activity-history" onClick={handleNavClick}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all"
                      activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200">
                      <History className="h-4 w-4 shrink-0 text-primary" />
                      {!collapsed && <span className="text-sm font-medium">היסטוריית פעילות</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {navItems.map((item) => {
                const active = isActive(item);
                const tutorialActive =
                  tutorialHighlightPath === item.url ||
                  item.aliases?.includes(tutorialHighlightPath ?? '');
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


        {/* Super admin section moved BELOW the menu */}
        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupContent className="px-3 py-3 border-t border-primary/10">
              <SuperAdminLeadAlert collapsed={collapsed} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>
      {user && !collapsed && <SidebarFooter className="shrink-0 border-t border-border bg-background p-0 shadow-none"><SidebarRitaChat /></SidebarFooter>}
    </Sidebar>
  );
}
