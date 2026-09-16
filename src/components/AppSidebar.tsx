import { useMemo } from 'react';
import {
  Activity,
  Users,
  Megaphone,
  MessageCircle,
  Home,
  Handshake,
  ClipboardList,
  HelpCircle,
  Gift,
  Settings,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { SuperAdminLeadAlert } from '@/components/admin/SuperAdminLeadAlert';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
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
 * Every sidebar entry owns a UNIQUE colour. The icon colour is forced with an
 * arbitrary Tailwind value that is the exact hex of the badge's `text-*-700`
 * token, so icon and counter pill always render in the same colour and no
 * inherited `text-slate-900` can win.
 */
const NAV_ITEMS: NavItem[] = [
  {
    title: 'משימות',
    url: '/',
    icon: ClipboardList,
    iconColor: '!text-[#0369a1]', // sky-700
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    aliases: ['/command-center', '/tasks'],
  },
  {
    title: 'לוח בקרה',
    url: '/dashboard',
    icon: Activity,
    iconColor: '!text-[#4338ca]', // indigo-700
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  {
    title: 'פוסטים',
    url: '/campaigns',
    icon: Megaphone,
    iconColor: '!text-[#c2410c]', // orange-700
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    aliases: ['/broadcast', '/automations', '/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'],
  },
  {
    title: 'אנשי קשר',
    url: '/lead-crm',
    icon: Users,
    iconColor: '!text-[#047857]', // emerald-700
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    aliases: ['/crm', '/leads'],
  },
  {
    title: 'נכסים',
    url: '/properties',
    icon: Home,
    iconColor: '!text-[#b45309]', // amber-700
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    aliases: ['/property', '/listings'],
  },
  {
    title: 'צ׳אטים',
    url: '/inbox',
    icon: MessageCircle,
    iconColor: '!text-[#0e7490]', // cyan-700
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    aliases: ['/communication'],
  },
  {
    title: 'עסקאות',
    url: '/deal-room',
    icon: Handshake,
    iconColor: '!text-[#be123c]', // rose-700
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
    aliases: ['/deals'],
  },
  {
    title: 'שיווק שותפים',
    url: '/affiliate-network',
    icon: AffiliateFlowchartIcon,
    iconColor: '!text-[#6d28d9]', // violet-700
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    title: 'הזמן חברים',
    url: '/referral',
    icon: Gift,
    iconColor: '!text-[#0f766e]', // teal-700
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
    title: 'נכסים לשיווק',
    url: '/affiliate',
    icon: Home,
    iconColor: '!text-[#0369a1]', // sky-700
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  {
    title: 'שיווק שותפים',
    url: '/affiliate-network',
    icon: AffiliateFlowchartIcon,
    iconColor: '!text-[#6d28d9]', // violet-700
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    title: 'תגמולים',
    url: '/referral',
    icon: Gift,
    iconColor: '!text-[#0f766e]', // teal-700
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
  const { isSuperAdmin, isAffiliateOnly } = useUserRole();
  const { settings } = useWhiteLabel();
  const { data: counts } = useSidebarCounts();
  const { isPartnerMode } = useAppMode();

  // Navigation follows the ACTIVE workspace: Rita's marketing workspace hides
  // properties, deals and partners; every other workspace shows them all.
  // In partner ("שותף") mode — or for an affiliate-only account — only the
  // affiliate screens are listed.
  const features = useWorkspaceFeatures();
  const affiliateOnlyNav = isPartnerMode || isAffiliateOnly;
  const navItems = useMemo(() => {
    if (affiliateOnlyNav) return PARTNER_NAV_ITEMS;
    return NAV_ITEMS.filter((item) => {
      if (item.url === '/properties') return features.listingsEnabled;
      if (item.url === '/deal-room') return features.dealsEnabled;
      if (item.url === '/affiliate-network') return features.partnersEnabled;
      return true;
    });
  }, [features, affiliateOnlyNav]);

  const countFor = (url: string): number | undefined => {
    if (!counts) return undefined;
    switch (url) {
      case '/': return counts.tasks;
      case '/lead-crm': return counts.leads;
      case '/properties': return counts.listings;
      case '/inbox': return counts.chats;
      case '/deal-room': return counts.deals;
      case '/campaigns': return counts.campaigns;
      default: return undefined;
    }
  };

  const formatCount = (n: number) => (n > 999 ? `${Math.floor(n / 1000)}k+` : String(n));

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const isActive = (item: NavItem) =>
    location.pathname === item.url ||
    item.aliases?.some((a) => location.pathname === a || location.pathname.startsWith(a + '/'));

  // The top identity area shows the signed-in user's profile avatar and keeps
  // the active workspace switcher next to it; clicking the avatar goes to /profile.


  return (
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu pt-3">
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
              <div className="mt-2 flex items-center gap-2" dir="rtl" onClick={(e) => e.stopPropagation()}>
                {/* Settings shortcut: opens /profile and closes the sidebar.
                    Hidden in Rita's marketing workspace. */}
                {!features.isRitaWorkspace && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSidebar();
                      navigate('/profile');
                    }}
                    title="הגדרות"
                    aria-label="הגדרות"
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}

                {/* Tutorial button: hidden in Rita's marketing workspace. */}
                {!features.isRitaWorkspace && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSidebar();
                      window.dispatchEvent(new Event('realtyz:start-tour'));
                    }}
                    title="הדרכה"
                    aria-label="הדרכה"
                    className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <HelpCircle className="h-4 w-4" />
                    הדרכה
                  </button>
                )}

                {/* Broker/partner toggle: hidden only in Rita's marketing workspace. */}
                {features.modeSwitcherEnabled && <AppModeSwitcher />}
              </div>

            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
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
                        end={item.url === '/'}
                        onClick={handleNavClick}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-900 hover:bg-slate-50 transition-all ${tutorialActive ? 'realtyz-tutorial-nav-glow' : ''}`}
                        activeClassName="!bg-slate-100 !text-slate-900 font-semibold ring-1 ring-slate-200"
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${item.iconColor}`} />
                        {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                        {!collapsed && item.badge && (
                          <span className="ms-auto rounded-full bg-background px-2.5 py-0.5 text-xs font-bold leading-none text-foreground ring-1 ring-border">
                            {item.badge}
                          </span>
                        )}
                        {!collapsed && !item.badge && (() => {
                          const c = countFor(item.url);
                          if (c === undefined || c === 0) return null;
                          return (
                            <span className="ms-auto rounded-full bg-background px-2 py-0.5 text-[11px] font-bold leading-none text-foreground ring-1 ring-border">
                              {formatCount(c)}
                            </span>
                          );
                        })()}
                      </NavLink>
                    </SidebarMenuButton>
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
    </Sidebar>
  );
}
