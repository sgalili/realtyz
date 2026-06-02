import {
  LayoutDashboard,
  Users,
  Megaphone,
  Brain,
  Briefcase,
  MessageCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
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
import { cn } from '@/lib/utils';

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  iconColor: string;
  aliases?: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    title: 'סנטימנט ותובנות',
    url: '/',
    icon: LayoutDashboard,
    iconColor: 'text-primary',
    aliases: ['/dashboard'],
  },
  {
    title: 'לקוחות ונכסים',
    url: '/lead-crm',
    icon: Users,
    iconColor: 'text-social-facebook',
    aliases: ['/crm', '/leads', '/properties', '/property'],
  },
  {
    title: 'חדר עסקאות',
    url: '/deal-room',
    icon: Briefcase,
    iconColor: 'text-primary-glow',
  },

  {
    title: 'קמפיינים',
    url: '/campaigns',
    icon: Megaphone,
    iconColor: 'text-destructive',
    aliases: ['/broadcast', '/automations', '/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'],
  },
  {
    title: 'מוח AI',
    url: '/knowledge',
    icon: Brain,
    iconColor: 'text-social-instagram',
    aliases: ['/live-conversations', '/ai-content', '/sentiment', '/conversation-analytics', '/insights'],
  },
  {
    title: 'צ׳אטים',
    url: '/inbox',
    icon: MessageCircle,
    iconColor: 'text-social-facebook',
    aliases: ['/communication'],
  },
];


const FORCED_DISPLAY_NAME = 'אודי ויטמן';

export function AppSidebar({ tutorialHighlightPath }: { tutorialHighlightPath?: string | null }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { isDemoMode } = useDemoMode();

  const { data: badgeCounts } = useQuery({
    queryKey: ['sidebar-nav-counts', user?.id],
    enabled: !!user?.id && !isDemoMode,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [leads, approvals, knowledge] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        supabase.from('approval_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('knowledge_documents').select('id', { count: 'exact', head: true }),
      ]);
      return {
        '/lead-crm': leads.count ?? 0,
        '/campaigns': approvals.count ?? 0,
        '/knowledge': knowledge.count ?? 0,
      } as Record<string, number>;
    },
  });

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const isActive = (item: NavItem) =>
    location.pathname === item.url ||
    item.aliases?.some((a) => location.pathname === a || location.pathname.startsWith(a + '/'));

  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const avatarUrl: string | null =
    meta.avatar_url || meta.picture || meta.profile_picture_url || null;
  const displayName = FORCED_DISPLAY_NAME;
  const initial = displayName.slice(0, 1);

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
                const count = badgeCounts?.[item.url] ?? 0;
                const badge = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        onClick={handleNavClick}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-md text-primary hover:text-primary hover:bg-primary/10 transition-all ${tutorialActive ? 'realtyz-tutorial-nav-glow' : ''}`}
                        activeClassName="!bg-primary !text-primary-foreground font-semibold !shadow-[inset_-3px_0_0_hsl(var(--primary-glow))]"
                      >
                        <item.icon
                          className={`h-4 w-4 shrink-0 ${active ? 'text-primary-foreground' : item.iconColor}`}
                        />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                        {!collapsed && badge && (
                          <span className="ms-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold leading-none text-primary shadow-sm">
                            {badge}
                          </span>
                        )}
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
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="p-0">
                <SidebarIntelInput />
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="p-0 border-t border-sidebar-border">
              <SidebarGroupContent className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-right transition-colors hover:bg-primary/10"
                >
                  <div className="w-10 h-10 min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] rounded-full overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] rounded-full object-cover aspect-square block shrink-0"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {initial}
                      </div>
                    )}
                  </div>
                  <span className="truncate text-sm font-semibold text-primary">
                    {displayName}
                  </span>
                </button>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
