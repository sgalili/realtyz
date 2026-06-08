import {
  Activity,
  Users,
  Megaphone,
  Brain,
  MessageCircle,
  Building2,
  Handshake,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { SuperAdminLeadAlert } from '@/components/admin/SuperAdminLeadAlert';
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
    title: 'לוח בקרה',
    url: '/',
    icon: Activity,
    iconColor: 'text-indigo-600',
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    aliases: ['/dashboard'],
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
  const avatarUrl: string | null =
    settings?.logo_url || meta.avatar_url || meta.picture || meta.profile_picture_url || null;
  const brokerName = settings?.agency_name || 'Realtyz AI';
  const initial = brokerName.slice(0, 1);

  return (
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu pt-3">
        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupContent className="px-3 pb-3 border-b border-primary/10">
              <SuperAdminLeadAlert collapsed={collapsed} />
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


        {!collapsed && (
          <div className="mt-auto">
            <SidebarGroup className="p-0 border-t border-slate-200">
              <SidebarGroupContent className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    className="flex flex-1 items-center gap-3 rounded-md px-1 py-1 text-right transition-colors hover:bg-slate-50 min-w-0"
                  >
                    <div className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg overflow-hidden shrink-0 ring-1 ring-slate-200">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={brokerName}
                          className="w-10 h-10 rounded-lg object-cover block"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                          {initial}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <div className="truncate text-sm font-bold text-slate-900">{brokerName}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        חשבון המתווך · ניהול נכסים, משרד ובו...
                      </div>
                    </div>
                  </button>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="p-0">
              <SidebarGroupContent className="p-0">
                <SidebarIntelInput />
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
