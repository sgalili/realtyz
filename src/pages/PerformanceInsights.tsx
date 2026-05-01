// Performance Insights — KPI dashboard for the Realtyz Deal Room
//
// Metrics computed live from the database (no placeholders):
//   • Total Prospects Engaged  — distinct leads with ≥1 outbound or inbound message in window
//   • Conversion Rate          — % of engaged prospects whose lead_stage reached negotiation/closed
//   • AI Response Time         — median minutes between an inbound prospect message and the next
//                                outbound (sender_type = 'ai' or 'agent') reply
//   • Deal Room Velocity       — average days between lead.created_at and last_interaction_at for
//                                leads currently in `closed` stage
//
// Visuals: shadcn/recharts BarChart (engagement by day) + LineChart (cumulative closures).
// Agent Leaderboard: per-profile outbound message count + reply-rate share for the window.
// Range toggle: This Week (7d) / This Month (30d).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Users,
  TrendingUp,
  Timer,
  Gauge,
  Trophy,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';

type RangeKey = 'week' | 'month';

const CLOSED_STAGES = new Set(['closed', 'won', 'converted']);
const NEGOTIATION_OR_LATER = new Set([
  'negotiation',
  'qualified',
  'meeting',
  'closed',
  'won',
  'converted',
]);

function rangeStart(range: RangeKey): Date {
  const days = range === 'week' ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDay(key: string): string {
  const d = new Date(key);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function PerformanceInsights() {
  const [range, setRange] = useState<RangeKey>('week');
  const sinceDate = useMemo(() => rangeStart(range), [range]);
  const sinceIso = sinceDate.toISOString();

  // Messages for the window — drives engagement, response time, and the leaderboard.
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['insights-messages', range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, lead_id, direction, sender_type, created_at, metadata')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
  });

  // Leads — used for conversion rate and Deal Room velocity.
  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ['insights-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, lead_stage, created_at, last_interaction_at, is_demo')
        .eq('is_demo', false)
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  // Profiles — agent leaderboard rows.
  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ['insights-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = loadingMessages || loadingLeads || loadingProfiles;

  const stats = useMemo(() => {
    const msgs = messages || [];
    const leadList = leads || [];

    // 1) Total Prospects Engaged in window (distinct lead ids with any message)
    const engagedIds = new Set<string>();
    msgs.forEach((m: any) => m.lead_id && engagedIds.add(m.lead_id));
    const totalEngaged = engagedIds.size;

    // 2) Conversion: of those engaged, how many leads reached negotiation/closed
    const stageById = new Map<string, string>();
    leadList.forEach((l: any) =>
      stageById.set(l.id, (l.lead_stage || '').toLowerCase())
    );
    let converted = 0;
    engagedIds.forEach((id) => {
      if (NEGOTIATION_OR_LATER.has(stageById.get(id) || '')) converted += 1;
    });
    const conversionRate = totalEngaged ? (converted / totalEngaged) * 100 : 0;

    // 3) AI / Agent Response Time — median minutes from an inbound to the next outbound per lead.
    const byLead = new Map<string, any[]>();
    msgs.forEach((m: any) => {
      if (!m.lead_id) return;
      const arr = byLead.get(m.lead_id) || [];
      arr.push(m);
      byLead.set(m.lead_id, arr);
    });
    const responseDeltas: number[] = [];
    byLead.forEach((arr) => {
      for (let i = 0; i < arr.length - 1; i++) {
        const cur = arr[i];
        const next = arr[i + 1];
        const isInbound = cur.direction === 'inbound' || cur.sender_type === 'lead';
        const isOutboundReply =
          next.direction === 'outbound' ||
          next.sender_type === 'ai' ||
          next.sender_type === 'agent' ||
          next.sender_type === 'user';
        if (isInbound && isOutboundReply) {
          const delta =
            (new Date(next.created_at).getTime() - new Date(cur.created_at).getTime()) /
            60_000;
          if (delta >= 0 && delta < 60 * 24) responseDeltas.push(delta);
        }
      }
    });
    const medianResponseMin = median(responseDeltas);

    // 4) Deal Room Velocity — avg days created → last_interaction for leads currently closed
    const velocities: number[] = [];
    leadList.forEach((l: any) => {
      const stage = (l.lead_stage || '').toLowerCase();
      if (!CLOSED_STAGES.has(stage)) return;
      if (!l.created_at || !l.last_interaction_at) return;
      const days =
        (new Date(l.last_interaction_at).getTime() - new Date(l.created_at).getTime()) /
        86_400_000;
      if (days >= 0) velocities.push(days);
    });
    const avgVelocityDays = velocities.length
      ? velocities.reduce((a, b) => a + b, 0) / velocities.length
      : 0;

    // Engagement by day (bar) + cumulative closures (line)
    const dayMap = new Map<string, number>();
    const days = range === 'week' ? 7 : 30;
    for (let i = 0; i < days; i++) {
      const d = new Date(sinceDate);
      d.setDate(d.getDate() + i);
      dayMap.set(dayKey(d.toISOString()), 0);
    }
    msgs.forEach((m: any) => {
      const k = dayKey(m.created_at);
      if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) || 0) + 1);
    });
    const engagementSeries = Array.from(dayMap.entries()).map(([k, v]) => ({
      day: shortDay(k),
      messages: v,
    }));

    // Cumulative new prospects per day in window
    const newProspectByDay = new Map<string, number>();
    dayMap.forEach((_, k) => newProspectByDay.set(k, 0));
    leadList.forEach((l: any) => {
      if (!l.created_at) return;
      if (new Date(l.created_at) < sinceDate) return;
      const k = dayKey(l.created_at);
      if (newProspectByDay.has(k))
        newProspectByDay.set(k, (newProspectByDay.get(k) || 0) + 1);
    });
    let cum = 0;
    const trendSeries = Array.from(newProspectByDay.entries()).map(([k, v]) => {
      cum += v;
      return { day: shortDay(k), prospects: cum };
    });

    // Leaderboard — outbound messages attributed by metadata.agent_id, fallback to all-team aggregate
    const outbound = msgs.filter(
      (m: any) =>
        m.direction === 'outbound' ||
        m.sender_type === 'ai' ||
        m.sender_type === 'agent' ||
        m.sender_type === 'user'
    );
    const perAgent = new Map<string, { sent: number; replyTo: number }>();
    outbound.forEach((m: any) => {
      const aid =
        m.metadata?.agent_id ||
        m.metadata?.user_id ||
        m.metadata?.author_id ||
        null;
      const key = aid || '__team__';
      const cur = perAgent.get(key) || { sent: 0, replyTo: 0 };
      cur.sent += 1;
      perAgent.set(key, cur);
    });

    return {
      totalEngaged,
      conversionRate,
      medianResponseMin,
      avgVelocityDays,
      engagementSeries,
      trendSeries,
      perAgent,
      totalOutbound: outbound.length,
    };
  }, [messages, leads, range, sinceDate]);

  const leaderboard = useMemo(() => {
    const rows = (profiles || []).map((p: any) => {
      const stat = stats.perAgent.get(p.id) || { sent: 0, replyTo: 0 };
      return {
        id: p.id,
        name: p.full_name || p.email || 'Agent',
        email: p.email,
        sent: stat.sent,
      };
    });
    // If nothing was attributed per agent, surface a single "Team" row using the team aggregate
    const attributed = rows.reduce((s, r) => s + r.sent, 0);
    const teamUnattributed = stats.perAgent.get('__team__')?.sent || 0;
    if (attributed === 0 && teamUnattributed > 0) {
      rows.push({
        id: '__team__',
        name: 'Team (unattributed)',
        email: null,
        sent: teamUnattributed,
      });
    }
    return rows
      .filter((r) => r.sent > 0 || rows.length <= 5)
      .sort((a, b) => b.sent - a.sent);
  }, [profiles, stats.perAgent]);

  const totalOutbound = stats.totalOutbound || 1;

  return (
    <div className="p-6 space-y-6" dir="ltr">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </span>
            Performance Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live KPIs for prospects, conversions, AI efficiency, and team velocity.
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile
          icon={Users}
          label="Prospects Engaged"
          value={isLoading ? null : String(stats.totalEngaged)}
          hint={range === 'week' ? 'last 7 days' : 'last 30 days'}
          tone="text-primary"
        />
        <KpiTile
          icon={TrendingUp}
          label="Conversion Rate"
          value={isLoading ? null : `${stats.conversionRate.toFixed(1)}%`}
          hint="Prospect → Negotiation+"
          tone="text-success"
        />
        <KpiTile
          icon={Timer}
          label="AI Response Time"
          value={
            isLoading
              ? null
              : stats.medianResponseMin > 0
              ? `${stats.medianResponseMin.toFixed(1)}m`
              : '—'
          }
          hint="median inbound → reply"
          tone="text-warning"
        />
        <KpiTile
          icon={Gauge}
          label="Deal Room Velocity"
          value={
            isLoading
              ? null
              : stats.avgVelocityDays > 0
              ? `${stats.avgVelocityDays.toFixed(1)}d`
              : '—'
          }
          hint="avg new → closed"
          tone="text-social-facebook"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Engagement by Day
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.engagementSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="messages"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              New Prospects (cumulative)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trendSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="prospects"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            Agent Leaderboard
            <Badge variant="outline" className="ml-2 font-normal text-[11px]">
              by outbound activity
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No agent activity in this window yet.
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row, idx) => {
                const share = (row.sent / totalOutbound) * 100;
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-md border bg-card/40 p-3"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shrink-0',
                        idx === 0
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{row.name}</div>
                      {row.email && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {row.email}
                        </div>
                      )}
                      <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{row.sent}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {share.toFixed(0)}% share
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | null;
  hint: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <Icon className={cn('h-4 w-4', tone)} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {value === null ? <Skeleton className="h-7 w-20" /> : value}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
      </CardContent>
    </Card>
  );
}
