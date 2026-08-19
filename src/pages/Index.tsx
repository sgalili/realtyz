import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Building2, Flame, CalendarCheck2, Trophy, MapPin, HelpCircle, FileSignature,
  Eye, MessageCircle, Home, AlertCircle,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, formatDistanceToNow, startOfMonth, subHours } from 'date-fns';
import { he } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { PendingListingsCard } from '@/components/PendingListingsCard';
import { ScheduledToursCard } from '@/components/dashboard/ScheduledToursCard';

import { MatchProgressCard } from '@/components/dashboard/MatchProgressCard';
import { ListingVisibilityManagerCard } from '@/components/listings/ListingVisibilityManagerCard';
import { GlobalSearchTrigger } from '@/components/GlobalSearch';


/* ────────────────────────────────────────────────────────────────────
   Realtyz — Real-Estate Dashboard
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
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ───── Realtime: new listings (Yad2 injections) ───── */
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`listings-inserts-${user.id}`)
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
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  /* ───── KPIs ───── */
  const { data: activeListings, isLoading: loadingListings } = useQuery({
    queryKey: ['kpi-active-listings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
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
    queryKey: ['kpi-hot-leads', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const since = subHours(new Date(), 24).toISOString();
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('last_interaction_at', since);
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: scheduledMeetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['kpi-scheduled-meetings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString());
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const { data: closedDeals, isLoading: loadingDeals } = useQuery({
    queryKey: ['kpi-closed-deals', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const monthStart = startOfMonth(new Date()).toISOString();
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('lead_stage', 'closed')
        .gte('last_interaction_at', monthStart);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  /* ───── Leads-by-Neighborhood Pie ───── */
  const { data: neighborhoodData } = useQuery({
    queryKey: ['leads-by-neighborhood'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('leads')
        .select('city')
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
    queryKey: ['real-estate-activity-feed', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const items: ActivityFeedItem[] = [];

      const [inquiries, showings, contracts, replies] = await Promise.all([
        (supabase as any)
          .from('contact_submissions')
          .select('id, full_name, message, created_at')
          .order('created_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('meetings')
          .select('id, title, lead_name, starts_at, created_at')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('closing_documents')
          .select('id, title, signer_name, sent_at, created_at')
          .eq('user_id', user!.id)
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(8),
        (supabase as any)
          .from('messages')
          .select('id, content, lead_id, sender_type, created_at')
          .eq('sender_type', 'lead')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      (inquiries.data ?? []).forEach((r: any) => {
        items.push({
          id: `inq-${r.id}`,
          type: 'inquiry',
          title: 'פנייה חדשה לנכס',
          detail: r.full_name || 'מתעניין חדש',
          at: r.created_at,
        });
      });
      (showings.data ?? []).forEach((r: any) => {
        items.push({
          id: `show-${r.id}`,
          type: 'showing',
          title: 'נקבע סיור בנכס',
          detail: `${r.lead_name ?? 'מתעניין'} · ${r.title}`,
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
          title: 'מתעניין הגיב',
          detail: (r.content ?? '').slice(0, 60) || 'הודעה חדשה',
          at: r.created_at,
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
    queryKey: ['market-alerts', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('escalation_alerts')
        .select('id, severity, lead_message, channel, created_at, status')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const dealProgressPct = Math.min(
    100,
    Math.round(((closedDeals ?? 0) / Math.max(1, MONTHLY_DEAL_GOAL)) * 100),
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">לוח בקרה</h1>
        <p className="text-sm text-muted-foreground mt-1">
          תמונת מצב חיה של הפעילות הנדל״נית שלך
        </p>
      </div>

      {/* Global search */}
      <div className="space-y-3">
        <GlobalSearchTrigger />
      </div>

      {/* 4 KPI widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <KpiCard
          icon={Building2}
          label="נכסים בטיפול"
          value={activeListings ?? 0}
          loading={loadingListings}
          tooltip="כמות הנכסים שמשווקים כרגע ופורסמו לציבור."
          to="/properties"
        />
        <KpiCard
          icon={Flame}
          label="מתעניינים חמים"
          value={hotLeads ?? 0}
          loading={loadingHot}
          tooltip="מתעניינים שיצרו אינטראקציה ב-24 השעות האחרונות."
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

      {/* Real-Estate Activity Feed + Neighborhood Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              פעילות נדל״ן בזמן אמת
            </CardTitle>
            <CardDescription>פניות, סיורים, חוזים ותגובות מתעניינים</CardDescription>
          </CardHeader>
          <CardContent>
            {!activityFeed ? (
              <Skeleton className="h-[260px] w-full" />
            ) : activityFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                עדיין אין פעילות. ברגע שתתקבל פנייה או תיקבע פגישה — היא תופיע כאן.
              </p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pe-1">
                {activityFeed.map((item) => (
                  <ActivityRow key={item.id} item={item} />
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
                מתעניינים לפי שכונה
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

      {/* AI-detected pending listings */}
      <PendingListingsCard />
      <ScheduledToursCard />
      <MatchProgressCard />
      <ListingVisibilityManagerCard />


      {/* Market Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning" />
            התראות שוק
          </CardTitle>
          <CardDescription>אירועים שדורשים את תשומת הלב שלך כעת</CardDescription>
        </CardHeader>
        <CardContent>
          {!marketAlerts ? (
            <Skeleton className="h-24 w-full" />
          ) : marketAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין התראות פתוחות. השוק שקט.
            </p>
          ) : (
            <div className="space-y-2">
              {marketAlerts.map((alert: any) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5"
                >
                  <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{alert.lead_message}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {alert.channel} ·{' '}
                      {format(new Date(alert.created_at), 'dd/MM HH:mm', { locale: he })}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate('/inbox')}>
                    טיפול
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* ─── Helpers ─── */

function ActivityRow({ item }: { item: ActivityFeedItem }) {
  const config = {
    inquiry: { Icon: MessageCircle, color: 'text-primary', bg: 'bg-primary/10' },
    showing: { Icon: Eye, color: 'text-accent-foreground', bg: 'bg-accent/30' },
    contract: { Icon: FileSignature, color: 'text-success', bg: 'bg-success/10' },
    reply: { Icon: MessageCircle, color: 'text-foreground', bg: 'bg-muted' },
  }[item.type];
  const { Icon } = config;
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors">
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
    </div>
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
    danger: 'text-red-500',
  }[accent];
  const accentBg = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
    danger: 'bg-red-100',
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
          className={`relative overflow-hidden border border-border/80 bg-card shadow-sm ${
            to ? 'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''
          }`}
        >
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="מידע על המדד"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

export default Dashboard;
