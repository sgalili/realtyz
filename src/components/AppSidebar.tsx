import {
  Activity,
  Users,
  Megaphone,
  Brain,
  MessageCircle,
  Building2,
  Handshake,
  ClipboardList,
  HelpCircle,
} from 'lucide-react';
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

type NavItem = {
  title: string;
  url: string;
  icon: typeof Activity;
  iconColor: string;
  badgeClass: string;
  aliases?: string[];
  badge?: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    title: 'משימות היום',
    url: '/',
    icon: ClipboardList,
    iconColor: 'text-sky-600',
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    aliases: ['/command-center', '/tasks'],
  },
  {
    title: 'לוח בקרה',
    url: '/dashboard',
    icon: Activity,
    iconColor: 'text-indigo-600',
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  {
    title: 'לקוחות',
    url: '/lead-crm',
    icon: Users,
    iconColor: 'text-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    aliases: ['/crm', '/leads'],
  },
  {
    title: 'נכסים',
    url: '/properties',
    icon: Building2,
    iconColor: 'text-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    aliases: ['/property', '/listings'],
  },
  {
    title: 'צ׳אטים',
    url: '/inbox',
    icon: MessageCircle,
    iconColor: 'text-cyan-600',
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    aliases: ['/communication'],
  },
  {
    title: 'עסקאות',
    url: '/deal-room',
    icon: Handshake,
    iconColor: 'text-rose-600',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
    aliases: ['/deals'],
  },
  {
    title: 'קמפיינים',
    url: '/campaigns',
    icon: Megaphone,
    iconColor: 'text-orange-500',
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    aliases: ['/broadcast', '/automations', '/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'],
  },
  {
    title: 'מוח AI',
    url: '/knowledge',
    icon: Brain,
    iconColor: 'text-purple-600',
    badgeClass: 'bg-purple-50 text-purple-700 ring-purple-200',
    aliases: ['/live-conversations', '/ai-content', '/sentiment', '/conversation-analytics', '/insights'],
  },
];

export function AppSidebar({ tutorialHighlightPath }: { tutorialHighlightPath?: string | null }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { settings } = useWhiteLabel();
  const { data: counts } = useSidebarCounts();

  const countFor = (url: string): number | undefined => {
    if (!counts) return undefined;
    switch (url) {
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

  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setUserAvatarUrl(null); return; }
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setUserAvatarUrl((data as any)?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const userDisplayName = friendlyUserDisplayName(user, 'ללא שם');
  const userInitial = userDisplayName.slice(0, 1);

  const officeLogoUrl: string | null = settings?.logo_url || null;
  const officeName = settings?.agency_name || 'Realtyz AI';
  const officeInitial = officeName.slice(0, 1);

  return (
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu pt-3">
        {/* TOP: user profile picture + full name */}
        {!collapsed && user && (
          <SidebarGroup className="p-0 border-b border-slate-200">
            <SidebarGroupContent className="px-3 py-3">
              <button
                type="button"
                onClick={() => { if (isMobile) setOpenMobile(false); navigate('/profile'); }}
                className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-right transition-colors hover:bg-slate-50 min-w-0"
              >
                <div className="w-10 h-10 min-w-[40px] rounded-full overflow-hidden shrink-0 ring-1 ring-slate-200">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt={userDisplayName} className="w-10 h-10 rounded-full object-cover block" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs font-bold text-white">
                      {userInitial}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <div className="truncate text-sm font-bold text-slate-900">{userDisplayName}</div>
                  <div className="truncate text-[11px] text-slate-500">{officeName}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  window.dispatchEvent(new Event('realtyz:start-tour'));
                }}
                title="הדרכה מהירה"
                aria-label="הדרכה מהירה"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <HelpCircle className="h-4 w-4" />
                הדרכה מהירה
              </button>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
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
                          <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs font-bold leading-none ring-1 ${item.badgeClass}`}>
                            {item.badge}
                          </span>
                        )}
                        {!collapsed && !item.badge && (() => {
                          const c = countFor(item.url);
                          if (c === undefined || c === 0) return null;
                          return (
                            <span className={`ms-auto rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ring-1 ${item.badgeClass}`}>
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
