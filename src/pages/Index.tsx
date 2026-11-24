import { useEffect } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@/lib/router-compat';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Building2, Flame, CalendarCheck2, Trophy, MapPin, HelpCircle, FileSignature,
  Eye, MessageCircle, Home, AlertCircle, Sparkles, Users, Megaphone, ClipboardList, Wallet,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, formatDistanceToNow, startOfMonth, subHours } from 'date-fns';
import { he } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { TERMINAL_LISTING_STATUSES } from '@/lib/publicationSettings';
import { PendingListingsCard } from '@/components/PendingListingsCard';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';


import { MatchProgressCard } from '@/components/dashboard/MatchProgressCard';
import { ListingVisibilityManagerCard } from '@/components/listings/ListingVisibilityManagerCard';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { usePropertyPageAccess } from '@/hooks/usePropertyPageAccess';
import { RecruitmentDashboard } from '@/components/dashboard/RecruitmentDashboard';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { ilsToCredits } from '@/lib/credits';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { activityAudience } from '@/lib/activityAudience';
import MyAds from '@/pages/MyAds';
import PartnerActivityProperties from '@/components/public/PartnerActivityProperties';


/* ────────────────────────────────────────────────────────────────────
   TORAFF — Real-Estate Dashboard
   KPI widgets, neighborhood pie chart, real-estate activity feed.
   No campaign / political widgets.
   ──────────────────────────────────────────────────────────────────── */

const PIE_COLORS = [
  'hsl(201 100% 40%)', // primary
  'hsl(201 100% 55%)',
  'hsl(134 61% 41%)', // success
  'hsl(38 52% 58%)',  // gold accent
  'hsl(213 40% 65%)',
  'hsl(0 0% 55%)',
];

const MONTHLY_DEAL_GOAL = 5;

interface ActivityFeedItem {
  id: string;
  type: 'inquiry' | 'showing' | 'contract' | 'reply';
  title: string;
  detail: string;
  at: string;
  leadId?: string | null;
}

const RealEstateDashboard = () => {
  const navigate = useNavigate();
  const { listingsEnabled } = useWorkspaceFeatures();
  const access = usePropertyPageAccess();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ───── Realtime: new listings (Yad2 injections) ───── */
  useEffect(() => {
    if (!user?.id) return;
    const channel = safeChannel(`listings-inserts-${user.id}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'listings' },
        (payload: any) => {
          const row = payload?.new ?? {};
          const isYad2 = row.source === 'yad2';
          const isSmart = !!row.is_investment_opportunity;
          const title = row.property_title || row.address || 'נכס חדש';
          const city = row.city ? ` · ${row.city}` : '';
          // Notification policy: no toast for routine ingestion events.
          void isYad2; void isSmart; void title; void city;

          queryClient.invalidateQueries({ queryKey: ['pending-listings', user.id] });
          queryClient.invalidateQueries({ queryKey: ['kpi-active-listings', user.id] });
        },
      )
      .subscribe();
    return () => { removeChannelSafe(channel); };
  }, [user?.id, queryClient]);

  /* ───── KPIs ───── */
  const brokersOnly = useBrokersOnly();
  const ownerId = useActiveWorkspaceOwnerId();
  const { data: activeListings, isLoading: loadingListings } = useQuery({
    queryKey: ['kpi-active-listings', user?.id, brokersOnly, ownerId],
    enabled: !!user?.id && (!brokersOnly || !!ownerId),
    queryFn: async () => {
      // Brokers-only counts the workspace catalog, never public-board publication.
      if (brokersOnly) {
        const { count } = await supabase.from('listings').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ownerId!).is('canonical_duplicate_of', null).not('status', 'in', `(${TERMINAL_LISTING_STATUSES.join(',')})`);
        return count ?? 0;
      }
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('is_published', true);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: hotLeads, isLoading: loadingHot } = useQuery({
    queryKey: ['kpi-hot-leads', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const since = subHours(new Date(), 24).toISOString();
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_owner_id', ownerId)
        .gte('last_interaction_at', since);
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: scheduledMeetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['kpi-scheduled-meetings', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_owner_id', ownerId)
        .eq('user_id', user!.id)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString());
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const { data: closedDeals, isLoading: loadingDeals } = useQuery({
    queryKey: ['kpi-closed-deals', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const monthStart = startOfMonth(new Date()).toISOString();
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_owner_id', ownerId)
        .eq('lead_stage', 'closed')
        .gte('last_interaction_at', monthStart);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  /* ───── Leads-by-Neighborhood Pie ───── */
  const { data: neighborhoodData } = useQuery({
    queryKey: ['leads-by-neighborhood', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('leads')
        .select('city')
        .eq('workspace_owner_id', ownerId)
        .not('city', 'is', null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { city: string | null }) => {
        const city = (row.city || '').trim();
        if (!city) return;
        counts[city] = (counts[city] ?? 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    },
    staleTime: 5 * 60_000,
  });

  /* ───── Real-Estate Activity Feed ─────
     Built from: contact_submissions (inquiries), meetings (showings),
     closing_documents (contracts), messages (lead replies). */
  const { data: activityFeed } = useQuery<ActivityFeedItem[]>({
    queryKey: ['real-estate-activity-feed', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const items: ActivityFeedItem[] = [];

      const [inquiries, showings, contracts, replies] = await Promise.all([
        (supabase as any)
          .from('contact_submissions')
          .select('id, full_name, phone_number, message, created_at, lead_id')
          .eq('workspace_owner_id', ownerId)
          .order('created_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('meetings')
          .select('id, title, lead_name, starts_at, created_at')
          .eq('workspace_owner_id', ownerId)
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('closing_documents')
          .select('id, title, signer_name, sent_at, created_at')
          .eq('workspace_owner_id', ownerId)
          .eq('user_id', user!.id)
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('messages')
          .select('id, content, lead_id, sender_type, created_at, leads!inner(workspace_owner_id)')
          .eq('leads.workspace_owner_id', ownerId)
          .eq('sender_type', 'lead')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      (inquiries.data ?? []).forEach((r: any) => {
        items.push({
          id: `inq-${r.id}`,
          type: 'inquiry',
          title: 'פנייה חדשה לנכס',
          detail: [r.full_name || 'ליד חדש', formatPhoneDisplay(r.phone_number)].filter(Boolean).join(' · '),
          at: r.created_at,
          leadId: r.lead_id,
        });
      });
      (showings.data ?? []).forEach((r: any) => {
        items.push({
          id: `show-${r.id}`,
          type: 'showing',
          title: 'נקבע סיור בנכס',
          detail: `${r.lead_name ?? 'ליד'} · ${r.title}`,
          at: r.created_at,
        });
      });
      (contracts.data ?? []).forEach((r: any) => {
        items.push({
          id: `con-${r.id}`,
          type: 'contract',
          title: 'חוזה נשלח לחתימה',
          detail: r.signer_name ? `${r.signer_name} · ${r.title}` : r.title,
          at: r.sent_at ?? r.created_at,
        });
      });
      (replies.data ?? []).forEach((r: any) => {
        items.push({
          id: `rep-${r.id}`,
          type: 'reply',
          title: 'ליד הגיב',
          detail: (r.content ?? '').slice(0, 60) || 'הודעה חדשה',
          at: r.created_at,
          leadId: r.lead_id,
        });
      });

      return items
        .filter((i) => !!i.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  /* ───── Market Alerts (replaces Security Events) ───── */
  const { data: marketAlerts } = useQuery({
    queryKey: ['market-alerts', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('escalation_alerts')
        .select('id, severity, lead_message, channel, trigger_category, lead_id, created_at, status')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(30);
      const rows = (data ?? []) as MarketAlertRow[];
      // Alerts are stored per user; keep only those whose lead belongs to the active workspace.
      const leadIds = [...new Set(rows.map((a) => a.lead_id).filter(Boolean))] as string[];
      const leads = new Map<string, string | null>();
      if (leadIds.length) {
        const { data: leadRows } = await db.from('leads').select('id, full_name').in('id', leadIds).eq('workspace_owner_id', ownerId);
        (leadRows ?? []).forEach((l: { id: string; full_name: string | null }) => leads.set(l.id, l.full_name));
      }
      return rows
        .filter((a) => (a.lead_id ? leads.has(a.lead_id) : ownerId === user!.id))
        .slice(0, 5)
        .map((a) => ({ ...a, lead_name: a.lead_id ? leads.get(a.lead_id) ?? null : null }));
    },
    refetchInterval: 60_000,
  });

  /* ───── Cockpit counters (workspace scoped) ───── */
  const { data: cockpit } = useQuery({
    queryKey: ['dashboard-cockpit', user?.id, ownerId],
    enabled: !!user?.id && !!ownerId,
    queryFn: async () => {
      const db = supabase as any;
      const [leads, campaigns, tasks, wallet] = await Promise.all([
        db.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ownerId),
        db.from('campaigns').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ownerId),
        db.from('scheduled_items').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ownerId).eq('user_id', user!.id).eq('status', 'pending'),
        db.from('credit_wallets').select('balance_ils').eq('user_id', user!.id).maybeSingle(),
      ]);
      return {
        leads: leads.count ?? 0,
        campaigns: campaigns.count ?? 0,
        tasks: tasks.count ?? 0,
        credits: Math.floor(ilsToCredits(Number(wallet.data?.balance_ils ?? 0))),
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const recentReplies = (activityFeed ?? []).filter((item) => item.type === 'reply').length;

  const dealProgressPct = Math.min(
    100,
    Math.round(((closedDeals ?? 0) / Math.max(1, MONTHLY_DEAL_GOAL)) * 100),
  );

  return (
    <div className="realtyz-dashboard-scale space-y-6" dir="rtl">
      <div className="dashboard-hero relative overflow-hidden rounded-2xl px-5 py-6 text-center text-primary-foreground shadow-lg">
        <Sparkles aria-hidden className="absolute left-4 top-4 h-6 w-6 opacity-40" />
        <h1 className="text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <p className="mt-1 text-sm opacity-90">
          תמונת מצב חיה של הנכסים, הלידים והפעילות שלך
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { icon: Building2, label: 'הנכסים שלי', to: '/properties', tone: 'nav-properties', count: activeListings },
            { icon: Users, label: 'לידים', to: '/lead-crm', tone: 'nav-tasks', count: cockpit?.leads },
            { icon: MessageCircle, label: 'צ׳אטים', to: '/inbox', tone: 'nav-chats', count: recentReplies },
            { icon: Megaphone, label: 'קמפיינים', to: '/campaigns', tone: 'nav-posts', count: cockpit?.campaigns },
            { icon: ClipboardList, label: 'מטלות', to: '/command-center', tone: 'nav-deals', count: cockpit?.tasks },
            { icon: Wallet, label: 'קרדיטים', to: '/wallet', tone: 'success', count: cockpit?.credits },
          ].map(({ icon: Icon, label, to, tone, count }) => (
            <button key={to} type="button" onClick={() => navigate(to)} className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl bg-background px-2 pb-3 pt-4 text-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" style={{ borderTop: `4px solid hsl(var(--${tone}))` }}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `hsl(var(--${tone}) / 0.15)`, color: `hsl(var(--${tone}))` }}><Icon className="h-7 w-7" strokeWidth={2.25} /></span>
              <span className="text-2xl font-extrabold leading-none tabular-nums" style={{ color: `hsl(var(--${tone}))` }}>{count === undefined ? '·' : count.toLocaleString('he-IL')}</span>
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>


      {/* Scheduled tours now live in the Tasks page (משימות → סיורים). */}


      {/* 4 KPI widgets */}
      <CollapsibleSection
        id="kpis"
        title="מדדים מרכזיים"
        description="נכסים, לידים, פגישות ועסקאות"
        icon={<Trophy />}
        tone="primary"
        badge={activeListings ?? undefined}
      >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <KpiCard
          icon={Building2}
          label="נכסים בטיפול"
          value={activeListings ?? 0}
          loading={loadingListings}
          tooltip={brokersOnly ? 'כמות הנכסים הפעילים במאגר שלך.' : 'כמות הנכסים שמשווקים כרגע ופורסמו לציבור.'}
          accent="success"
          to={access.properties || brokersOnly ? '/properties' : '/my-ads'}
        />
        <KpiCard
          icon={Flame}
          label="לידים חמים"
          value={hotLeads ?? 0}
          loading={loadingHot}
          tooltip="לידים שיצרו אינטראקציה ב-24 השעות האחרונות."
          accent="warning"
          to="/lead-crm"
        />
        <KpiCard
          icon={CalendarCheck2}
          label="פגישות שנקבעו"
          value={scheduledMeetings ?? 0}
          loading={loadingMeetings}
          tooltip="פגישות והצגות נכס עתידיות במצב 'מתוכננת'."
          to="/calendar"
        />
        <KpiCard
          icon={Trophy}
          label="עסקאות שנסגרו"
          value={closedDeals ?? 0}
          loading={loadingDeals}
          tooltip={`התקדמות לעבר יעד חודשי של ${MONTHLY_DEAL_GOAL} עסקאות.`}
          accent="danger"
          to="/deal-room"
        />
      </div>
      </CollapsibleSection>


      {/* Real-Estate Activity Feed + Neighborhood Pie */}
      <CollapsibleSection
        id="activity-and-neighborhoods"
        title="פעילות נדל״ן והתפלגות שכונות"
        description="פניות, סיורים, חוזים ותגובות לידים"
        icon={<Home />}
        tone="nav-chats"
        badge={activityFeed?.length}
      >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              פעילות נדל״ן בזמן אמת
            </CardTitle>
            <CardDescription>פניות, סיורים, חוזים ותגובות לידים</CardDescription>
          </CardHeader>
          <CardContent>
            {!activityFeed ? (
              <Skeleton className="h-[260px] w-full" />
            ) : activityFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                עדיין אין פעילות. ברגע שתתקבל פנייה או תיקבע פגישה, היא תופיע כאן.
              </p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pe-1">
                {activityFeed.map((item) => (
                  <ActivityRow key={item.id} item={item} onOpen={(leadId) => navigate(`/lead-crm/${leadId}`)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                לידים לפי שכונה
              </CardTitle>
              <CardDescription className="text-xs">6 שכונות מובילות</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!neighborhoodData ? (
              <Skeleton className="h-[260px] w-full" />
            ) : neighborhoodData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                אין מספיק נתוני שכונה כדי לצייר התפלגות.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={neighborhoodData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="44%"
                    outerRadius={80}
                    labelLine={false}
                  >
                    {neighborhoodData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={48}
                    iconSize={10}
                    formatter={(value) => (
                      <span className="px-[2px] text-xs font-medium text-foreground">{value}</span>
                    )}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      </CollapsibleSection>


      {/* Listing management is hidden in broker-recruitment mode */}
      {listingsEnabled && (
        <>
          <CollapsibleSection id="pending-listings" title="נכסים שזוהו אוטומטית" description="אישור, עריכה או מחיקה של נכסים שהופקו על ידי ה-AI" icon={<Sparkles />} tone="nav-properties">
            <PendingListingsCard />
          </CollapsibleSection>
          <CollapsibleSection id="match-progress" title="התאמות לידים ונכסים" description="מצב ההתאמות בין לידים לנכסים" icon={<Users />} tone="success">
            <MatchProgressCard />
          </CollapsibleSection>
          {!brokersOnly && <CollapsibleSection id="listing-visibility" title="ניהול חשיפת נכסים" description="נכסים מקודמים ומודגשים">
            <ListingVisibilityManagerCard />
          </CollapsibleSection>}
        </>
      )}



      {/* Market Alerts */}
      <CollapsibleSection
        id="market-alerts"
        title="התראות שוק"
        description="אירועים שדורשים את תשומת הלב שלך כעת"
        icon={<AlertCircle />}
        tone="warning"
        badge={marketAlerts?.length}
      >
      <Card>
        <CardContent className="pt-4">
          {!marketAlerts ? (
            <Skeleton className="h-24 w-full" />
          ) : marketAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין התראות פתוחות. השוק שקט.
            </p>
          ) : (
            <div className="space-y-2">
              {marketAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5"
                >
                  <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{marketAlertTitle(alert)}</p>
                    {alert.lead_message && <p className="text-sm text-muted-foreground line-clamp-2">״{alert.lead_message}״</p>}
                    <p className="text-xs text-muted-foreground">
                      {[alert.lead_name, channelLabel(alert.channel), format(new Date(alert.created_at), 'dd/MM HH:mm', { locale: he })].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate(alert.lead_id ? `/lead-crm/${alert.lead_id}` : '/inbox')}>
                    {alert.lead_id ? 'לכרטיס הליד' : 'לצ׳אטים'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </CollapsibleSection>

    </div>
  );
};

/* ─── Helpers ─── */

type MarketAlertRow = { id: string; severity: string | null; lead_message: string | null; channel: string | null; trigger_category: string | null; lead_id: string | null; created_at: string; status: string; lead_name?: string | null };

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'וואטסאפ', sms: 'SMS', email: 'אימייל', facebook: 'פייסבוק', messenger: 'מסנג׳ר', instagram: 'אינסטגרם',
  web: 'טופס באתר', form: 'טופס באתר', website: 'טופס באתר', phone: 'שיחת טלפון', voice: 'שיחת טלפון', ivr: 'שיחה קולית',
  deal_room: 'חדר עסקאות', inbox: 'צ׳אטים', rita: 'ריטה',
};
const CATEGORY_TITLES: Record<string, string> = {
  urgent: 'ליד מבקש מענה דחוף', complaint: 'ליד הביע אי שביעות רצון', legal: 'ליד העלה נושא משפטי',
  price: 'ליד שואל על מחיר או מיקוח', meeting: 'ליד מבקש לתאם פגישה', human: 'ליד מבקש לדבר עם מתווך',
  cancel: 'ליד שוקל לוותר', escalation: 'שיחה שדורשת את המעורבות שלך',
};
function channelLabel(channel: string | null) {
  if (!channel) return null;
  return CHANNEL_LABELS[channel.toLowerCase()] ?? null;
}
function marketAlertTitle(alert: MarketAlertRow) {
  const byCategory = alert.trigger_category ? CATEGORY_TITLES[alert.trigger_category.toLowerCase()] : undefined;
  if (byCategory) return byCategory;
  return alert.severity === 'high' || alert.severity === 'critical' ? 'ליד מחכה לתגובה דחופה ממך' : 'ליד מחכה לתגובה ממך';
}

function ActivityRow({ item, onOpen }: { item: ActivityFeedItem; onOpen: (leadId: string) => void }) {
  const config = {
    inquiry: { Icon: MessageCircle, color: 'text-primary', bg: 'bg-primary/10' },
    showing: { Icon: Eye, color: 'text-accent-foreground', bg: 'bg-accent/30' },
    contract: { Icon: FileSignature, color: 'text-success', bg: 'bg-success/10' },
    reply: { Icon: MessageCircle, color: 'text-foreground', bg: 'bg-muted' },
  }[item.type];
  const { Icon } = config;
  return (
    <button type="button" disabled={!item.leadId} onClick={() => item.leadId && onOpen(item.leadId)} className="flex w-full items-start gap-3 p-2.5 rounded-lg border border-border/40 text-right hover:bg-muted/30 transition-colors disabled:cursor-default">
      <div className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${config.bg}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
        {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: he })}
      </span>
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  tooltip,
  accent = 'primary',
  suffix,
  to,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  loading?: boolean;
  tooltip: string;
  accent?: 'primary' | 'success' | 'warning' | 'danger';
  suffix?: string;
  to?: string;
}) {
  const navigate = useNavigate();
  const accentColor = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }[accent];
  const accentBg = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
    danger: 'bg-destructive/10',
  }[accent];
  const accentStripe = {
    primary: 'before:bg-primary',
    success: 'before:bg-success',
    warning: 'before:bg-warning',
    danger: 'before:bg-destructive',
  }[accent];

  return (
    <TooltipProvider delayDuration={120}>
      <UiTooltip>
        <Card
          dir="rtl"
          onClick={to ? () => navigate(to) : undefined}
          role={to ? 'button' : undefined}
          tabIndex={to ? 0 : undefined}
          onKeyDown={
            to
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(to);
                  }
                }
              : undefined
          }
          className={`relative overflow-hidden border border-border/80 bg-card shadow-xs before:absolute before:inset-x-0 before:top-0 before:h-1 ${accentStripe} ${
            to ? 'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring' : ''
          }`}
        >
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="מידע על המדד"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <CardContent className="flex flex-col items-center gap-2 px-3 py-4 text-center sm:px-4">
            <div className={`w-10 h-10 rounded-full grid place-items-center ${accentBg}`}>
              <Icon className={`h-5 w-5 ${accentColor}`} />
            </div>
            <p className="text-sm font-medium leading-none text-muted-foreground sm:text-[15px]">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p
                className={`flex flex-wrap items-baseline justify-center gap-1 text-2xl font-black tabular-nums sm:text-[28px] ${accentColor}`}
                dir="rtl"
              >
                <span dir="ltr">{value.toLocaleString()}</span>
                {suffix && (
                  <span className="text-sm font-bold text-muted-foreground">{suffix}</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
        <TooltipContent side="top" align="center">
          <p className="max-w-56 text-center text-xs leading-relaxed">{tooltip}</p>
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

/**
 * Rita's marketing workspace gets the broker-acquisition dashboard; every
 * standard broker or affiliate workspace gets the full real-estate dashboard.
 */
const Dashboard = () => {
  const { isRitaWorkspace } = useWorkspaceFeatures();
  const { roles, loading } = useUserRole();
  const { isPartnerMode } = useAppMode();
  if (loading) return <p role="status" className="py-8 text-center">טוען פעילות…</p>;
  const audience = activityAudience(roles, isPartnerMode);
  if (audience !== 'professional') return <div dir="rtl" className="space-y-3"><h1 className="text-xl font-semibold">הפעילות שלי</h1>{audience === 'partner' ? <PartnerActivityProperties /> : <MyAds activityOnly />}</div>;
  return isRitaWorkspace ? <RecruitmentDashboard /> : <RealEstateDashboard />;
};

export default Dashboard;
