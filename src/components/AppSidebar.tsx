import {
  LayoutDashboard,
  Users,
  Megaphone,
  Brain,
  Handshake,
  Briefcase,
} from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
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


type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  iconColor: string;
  aliases?: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    title: 'לוח בקרה',
    url: '/',
    icon: LayoutDashboard,
    iconColor: 'text-primary',
    aliases: ['/dashboard'],
  },
  {
    title: 'CRM ניהול לקוחות ונכסים',
    url: '/lead-crm',
    icon: Users,
    iconColor: 'text-social-facebook',
    aliases: ['/crm', '/leads', '/properties', '/property'],
  },
  {
    title: 'מאגר נכסים משולב AI',
    url: '/properties-hub',
    icon: Building2,
    iconColor: 'text-primary',
  },
  {
    title: 'חדר עסקה (Pipeline)',
    url: '/deal-room',
    icon: Briefcase,
    iconColor: 'text-primary-glow',
  },
  {
    title: 'עסקאות משותפות',
    url: '/shared-deals',
    icon: Handshake,
    iconColor: 'text-warning',
  },
  {
    title: 'מרכז הפצה ואוטומציות',
    url: '/campaigns',
    icon: Megaphone,
    iconColor: 'text-destructive',
    aliases: ['/broadcast', '/automations', '/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'],
  },
  {
    title: 'מוח ה-AI ומאגר הידע',
    url: '/knowledge',
    icon: Brain,
    iconColor: 'text-social-instagram',
    aliases: ['/live-conversations', '/ai-content', '/sentiment', '/conversation-analytics', '/insights'],
  },
];

export function AppSidebar({ tutorialHighlightPath }: { tutorialHighlightPath?: string | null }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
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



        {/* 4 minimal nav nodes */}
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
          <SidebarGroup className="mt-auto sticky bottom-0 z-10 p-0">
            <SidebarGroupContent className="p-0">
              <SidebarIntelInput />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
