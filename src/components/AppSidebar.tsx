import {
  LayoutDashboard,
  Crosshair,
  Users,
  MessageSquare,
  Sparkles,
  Megaphone,
  LogOut,
  Settings,
  Activity,
  Crown,
  Inbox,
  MessagesSquare,
  BarChart3,
  Shield,
  Radio,
  ShieldCheck,
  Brain,
  ClipboardCheck,
  History,
  CalendarDays,
  Wallet,
  Share2,
  Cpu,
  Handshake,
  Briefcase,
  Gauge,
  Bot,
  Home,
  Palette,
} from 'lucide-react';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_CAMPAIGNS, getDemoCandidateKnowledgeDocuments, getDemoCandidateMessages, getDemoCandidateVoters } from '@/lib/demoData';
import { SuperAdminLeadAlert } from '@/components/admin/SuperAdminLeadAlert';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LiveActivityFeed } from '@/components/dashboard/LiveActivityFeed';
import { StrategicPdfExportButton } from '@/components/dashboard/StrategicPdfExportButton';

import { SidebarIntelInput } from '@/components/SidebarIntelInput';

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  iconColor: string;
  aliases?: string[];
  /** required role to see the item; undefined = visible to all authenticated */
  requires?: 'admin' | 'super_admin' | 'managing_broker';
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'תפעול',
    items: [
      { title: 'לוח בקרה', url: '/', icon: LayoutDashboard, iconColor: 'text-primary', aliases: ['/dashboard'] },
      { title: 'ניהול מתעניינים', url: '/lead-crm', icon: Users, iconColor: 'text-social-facebook', aliases: ['/crm'] },
      { title: 'תיבת הודעות', url: '/inbox', icon: MessageSquare, iconColor: 'text-social-messenger' },
      { title: 'עסקאות', url: '/deal-room', icon: Handshake, iconColor: 'text-warning' },
      { title: 'נכסים', url: '/properties', icon: Home, iconColor: 'text-primary-glow' },
      { title: 'Automation Studio', url: '/automations', icon: Bot, iconColor: 'text-primary' },
    ],
  },
  {
    label: 'תקשורת',
    items: [
      { title: 'מרכז הקמפיינים', url: '/campaigns', icon: Megaphone, iconColor: 'text-destructive', aliases: ['/campaign-strategy', '/approval-queue', '/calendar', '/sms-blast', '/ads'] },
      { title: 'שיחות חיות', url: '/live-conversations', icon: MessagesSquare, iconColor: 'text-social-whatsapp' },
      { title: 'מאגר הידע', url: '/knowledge', icon: Brain, iconColor: 'text-social-instagram' },
      { title: 'מחולל תוכן AI', url: '/ai-content', icon: Sparkles, iconColor: 'text-warning' },
    ],
  },
  {
    label: 'ניתוח',
    items: [
      { title: 'ניתוח סנטימנט', url: '/sentiment', icon: Activity, iconColor: 'text-success' },
      { title: 'ניתוח שיחות', url: '/conversation-analytics', icon: BarChart3, iconColor: 'text-primary-glow' },
      { title: 'Performance Insights', url: '/insights', icon: Gauge, iconColor: 'text-warning' },
      { title: 'ביצועים עסקיים', url: '/business-performance', icon: Briefcase, iconColor: 'text-primary' },
      { title: 'יומן פעילות', url: '/activity-log', icon: History, iconColor: 'text-social-telegram' },
      { title: 'ניהול חבילה', url: '/subscription', icon: Crown, iconColor: 'text-warning', requires: 'managing_broker' },
      { title: 'חיובים וחשבוניות', url: '/finance', icon: Wallet, iconColor: 'text-primary', requires: 'managing_broker' },
    ],
  },
  {
    label: 'חיבורים',
    items: [
      { title: 'חיבור רשתות חברתיות', url: '/social-connect', icon: Share2, iconColor: 'text-social-instagram' },
      { title: 'הפעלת שירותים', url: '/api-settings', icon: Settings, iconColor: 'text-muted-foreground' },
    ],
  },
  {
    label: 'ניהול',
    items: [
      { title: 'ממשק ניהול על', url: '/super-admin', icon: Shield, iconColor: 'text-warning', requires: 'super_admin' },
      { title: 'הגדרות API ותשתיות', url: '/api-settings', icon: Cpu, iconColor: 'text-primary', requires: 'super_admin' },
      { title: 'אבטחה', url: '/security', icon: Shield, iconColor: 'text-destructive', requires: 'admin' },
      { title: 'פרטיות וציות', url: '/privacy', icon: ShieldCheck, iconColor: 'text-primary' },
      { title: 'ניהול צוות', url: '/team', icon: Users, iconColor: 'text-primary', requires: 'managing_broker' },
      { title: 'מיתוג הסוכנות', url: '/settings/branding', icon: Palette, iconColor: 'text-primary', requires: 'managing_broker' },
      { title: 'פניות נכנסות', url: '/leads', icon: Inbox, iconColor: 'text-social-telegram', requires: 'admin' },
    ],
  },
];

const BADGE_TITLES = [
  'ניהול מתעניינים',
  'תיבת הודעות',
  'שיחות חיות',
  'מאגר הידע',
  'מרכז הקמפיינים',
  'יומן פעילות',
  'ניתוח סנטימנט',
  'ניתוח שיחות',
] as const;

type BadgeTitle = (typeof BADGE_TITLES)[number];
type BadgeCounts = Record<BadgeTitle, number>;

const formatBadgeCount = (value: number) => (value > 99 ? '99+' : String(value));

export function AppSidebar({ tutorialHighlightPath }: { tutorialHighlightPath?: string | null }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin, isSuperAdmin, isManagingBroker, loading: rolesLoading } = useUserRole();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const demoBadgeCounts = useMemo<BadgeCounts>(() => {
    const demoVoters = getDemoCandidateVoters(demoCandidateId);
    const demoMessages = getDemoCandidateMessages(demoCandidateId);
    const demoKnowledge = getDemoCandidateKnowledgeDocuments(demoCandidateId);
    return {
      'ניהול מתעניינים': demoVoters.length,
      'תיבת הודעות': demoMessages.length,
      'שיחות חיות': new Set(demoMessages.slice(0, 18).map((message) => message.lead_id)).size,
      'מאגר הידע': demoKnowledge.length,
      'מרכז הקמפיינים': 7 + DEMO_CAMPAIGNS.filter((campaign) => campaign.status === 'active' || campaign.status === 'scheduled').length,
      'יומן פעילות': 36,
      'ניתוח סנטימנט': demoVoters.filter((voter) => voter.sentiment === 'negative').length,
      'ניתוח שיחות': demoMessages.length,
    };
  }, [demoCandidateId]);

  const { data: activityCounts } = useQuery({
    queryKey: ['sidebar-activity-counts', user?.id],
    enabled: !!user?.id && !isDemoMode,
    refetchInterval: 60_000,
    queryFn: async (): Promise<BadgeCounts> => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [voters, messages, liveMessages, knowledge, approvals, activity, scheduled, campaigns, sentiment, conversations] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        supabase.from('messages').select('lead_id').gte('created_at', since1h),
        supabase.from('knowledge_documents').select('id', { count: 'exact', head: true }).gte('created_at', since7d),
        supabase.from('approval_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('interaction_activity_log').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        supabase.from('scheduled_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sentiment', 'negative'),
        supabase.from('chat_history').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      ]);

      return {
        'ניהול מתעניינים': voters.count ?? 0,
        'תיבת הודעות': messages.count ?? 0,
        'שיחות חיות': new Set((liveMessages.data ?? []).map((message) => message.lead_id).filter(Boolean)).size,
        'מאגר הידע': knowledge.count ?? 0,
        'מרכז הקמפיינים': (approvals.count ?? 0) + (scheduled.count ?? 0) + (campaigns.count ?? 0),
        'יומן פעילות': activity.count ?? 0,
        'ניתוח סנטימנט': sentiment.count ?? 0,
        'ניתוח שיחות': conversations.count ?? 0,
      };
    },
  });

  const badgeCounts = useMemo(() => {
    const source = isDemoMode ? demoBadgeCounts : activityCounts;
    return Object.fromEntries(BADGE_TITLES.map((title) => {
      const value = source?.[title] ?? 0;
      return [title, value > 0 ? formatBadgeCount(value) : ''];
    }));
  }, [activityCounts, demoBadgeCounts, isDemoMode]);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  // useUserRole is the single source of truth for admin UI visibility.
  // It already includes the hardcoded super-admin email override internally.
  const canSee = (item: NavItem) => {
    if (!item.requires) return true;
    if (item.requires === 'super_admin') return isSuperAdmin;
    if (item.requires === 'admin') return isAdmin;
    if (item.requires === 'managing_broker') return isManagingBroker;
    return true;
  };

  const confirmSignOut = async () => {
    // Block demo mode from auto-re-enabling once user is signed out.
    window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
    window.localStorage.setItem('realtyz-demo-mode', 'false');
    window.localStorage.setItem('realtyz-authenticated-session', 'false');
    await signOut();
    window.location.replace('/auth');
  };

  return (
    <>
    <Sidebar collapsible="offcanvas" className="realtyz-premium-sidebar border-l border-r-0 border-sidebar-border" side="right">
      <SidebarContent className="realtyz-sidebar-menu pt-2">
        {/* Free-trial CTA removed from sidebar per UX cleanup. */}
        <SidebarGroup>
          <SidebarGroupContent className="px-3 pb-2">
            <StrategicPdfExportButton compact={collapsed} className={collapsed ? 'mx-auto' : ''} />
          </SidebarGroupContent>
        </SidebarGroup>
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(canSee);
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-primary/55 font-bold">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = location.pathname === item.url || item.aliases?.includes(location.pathname);
                    const tutorialActive = tutorialHighlightPath === item.url || item.aliases?.includes(tutorialHighlightPath ?? '');
                    const badge = badgeCounts[item.title];
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={active}>
                          <NavLink
                            to={item.url}
                            end={item.url === '/'}
                            onClick={handleNavClick}
                            className={`group flex items-center gap-3 px-3 py-2 rounded-md text-primary hover:text-primary hover:bg-primary/10 hover:shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.35)] transition-all ${tutorialActive ? 'realtyz-tutorial-nav-glow' : ''}`}
                            activeClassName="!bg-primary !text-primary-foreground font-semibold !shadow-[inset_-3px_0_0_hsl(var(--primary-glow)),0_12px_28px_-18px_hsl(var(--primary)/0.55)]"
                          >
                            <item.icon
                              className={`h-4 w-4 shrink-0 ${
                                active ? 'text-primary-foreground' : item.iconColor
                              }`}
                            />
                            {!collapsed && <span className="text-sm">{item.title}</span>}
                            {!collapsed && badge && <span className="ms-auto rounded-full bg-white px-2 py-0.5 text-sm font-bold leading-none text-primary shadow-sm">{badge}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {!collapsed && (
          <SidebarGroup className="mt-auto sticky bottom-0 z-10 p-0">
            <SidebarGroupContent className="p-0">
              <SidebarIntelInput />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className={collapsed ? 'mt-auto pt-3 border-t border-primary/10' : 'pt-2 border-t border-primary/10'}>
          <SidebarGroupContent className="px-3 pb-3">
            {isSuperAdmin && (
              <div className="mb-2">
                <SuperAdminLeadAlert collapsed={collapsed} />
              </div>
            )}
            {collapsed ? (
              <SidebarMenuButton
                onClick={() => setLogoutOpen(true)}
                aria-label="התנתקות"
                className="text-primary/75 hover:text-primary hover:bg-primary/10 hover:shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.35)]"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </SidebarMenuButton>
            ) : (
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/5">
                {user && (
                  <p className="min-w-0 flex-1 truncate text-[11px] text-primary/55">
                    {user.email}
                  </p>
                )}
                {isSuperAdmin && (
                  <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-warning">
                    Admin
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setLogoutOpen(true)}
                  aria-label="התנתקות"
                  title="התנתקות"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary/70 transition-all duration-200 hover:bg-primary/10 hover:text-primary active:scale-95"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
      <AlertDialogContent dir="rtl" className="text-right">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle>להתנתק מהמערכת?</AlertDialogTitle>
          <AlertDialogDescription>לאחר ההתנתקות תועבר למסך הכניסה.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start sm:space-x-0">
          <AlertDialogAction onClick={confirmSignOut}>התנתקות</AlertDialogAction>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
