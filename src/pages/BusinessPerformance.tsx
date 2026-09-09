// Business Performance — KPI dashboard for the Realtyz agent
//
// Sections:
//   1) Funnel: Leads → Qualified → Meetings Scheduled → Offers → Closed Deals
//   2) Revenue Attribution: Estimated Pipeline Value, Projected Monthly Commission
//   3) Channel Efficiency: avg hours from "new" to "qualified" by first-touch channel
//   4) Lead list with commission editor (so Udi can input estimated commission per deal)
//
// Strictly business KPIs. No political/survey data.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ScrollArea,
} from '@/components/ui/scroll-area';
import {
  Banknote,
  Briefcase,
  CalendarRange,
  Filter,
  Handshake,
  LineChart as LineIcon,
  PiggyBank,
  Target,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CommissionEditor } from '@/components/dealroom/CommissionEditor';

type Window = '30' | '90' | '365';

type PerfPayload = {
  window_days: number;
  funnel: {
    leads: number;
    qualified: number;
    meetings: number;
    offers: number;
    closed_won: number;
    closed_lost: number;
    ghosted: number;
  };
  revenue: {
    currency: string;
    pipeline_value: number;
    pipeline_count: number;
    closed_value: number;
    closed_count: number;
    projected_monthly: number;
    projected_monthly_count: number;
  };
  efficiency: Array<{
    channel: string;
    avg_hours: number;
    qualified_count: number;
  }>;
};

const CHANNEL_LABEL_HE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  email: 'אימייל',
  unknown: 'לא ידוע',
};

function formatILS(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—';
  if (h < 1) return `${Math.round(h * 60)} דק׳`;
  if (h < 48) return `${h.toFixed(1)} שעות`;
  return `${(h / 24).toFixed(1)} ימים`;
}

export default function BusinessPerformance() {
  const [windowDays, setWindowDays] = useState<Window>('90');
  const [editingLead, setEditingLead] = useState<{
    id: string;
    full_name: string | null;
    commission_amount: number | null;
    expected_close_date: string | null;
  } | null>(null);

  const { data: perf, isLoading: perfLoading, error: perfError } = useQuery({
    queryKey: ['business-performance', windowDays],
    queryFn: async (): Promise<PerfPayload | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return null;
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: PerfPayload | null; error: { message: string } | null }>)(
        'get_business_performance',
        { user_uuid: u.user.id, days_window: Number(windowDays) },
      );
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: leadsForCommission, isLoading: leadsLoading } = useQuery({
    queryKey: ['business-leads', windowDays],
    queryFn: async () => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - Number(windowDays));
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, lead_stage, interaction_outcome, commission_amount, expected_close_date, last_interaction_at')
        .eq('is_demo', false)
        .gte('created_at', sinceDate.toISOString())
        .order('priority_score', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        full_name: string | null;
        lead_stage: string | null;
        interaction_outcome: string | null;
        commission_amount: number | null;
        expected_close_date: string | null;
        last_interaction_at: string | null;
      }>;
    },
  });

  const funnelData = useMemo(() => {
    const f = perf?.funnel;
    if (!f) return [];
    return [
      { key: 'leads',     label: 'אנשי קשר',  value: f.leads,     color: 'hsl(217 91% 60%)' },
      { key: 'qualified', label: 'מוסמכים',     value: f.qualified, color: 'hsl(199 89% 48%)' },
      { key: 'meetings',  label: 'פגישות',      value: f.meetings,  color: 'hsl(43 96% 56%)'  },
      { key: 'offers',    label: 'הצעות',       value: f.offers,    color: 'hsl(24 95% 53%)'  },
      { key: 'closed',    label: 'עסקאות סגורות', value: f.closed_won, color: 'hsl(142 71% 45%)' },
    ];
  }, [perf]);

  const conversionRate = useMemo(() => {
    const f = perf?.funnel;
    if (!f || f.leads === 0) return 0;
    return Math.round((f.closed_won / f.leads) * 1000) / 10;
  }, [perf]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            ביצועים עסקיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מעקב אחר משפך המכירות, ייחוס הכנסות וזמן האיכות לכל ערוץ
          </p>
        </div>
        <Tabs value={windowDays} onValueChange={(v) => setWindowDays(v as Window)}>
          <TabsList>
            <TabsTrigger value="30">30 ימים</TabsTrigger>
            <TabsTrigger value="90">90 ימים</TabsTrigger>
            <TabsTrigger value="365">שנה</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile
          icon={Wallet}
          tone="text-primary"
          label="ערך פייפליין משוער"
          value={perf ? formatILS(perf.revenue.pipeline_value) : null}
          hint={perf ? `${perf.revenue.pipeline_count} עסקאות פתוחות` : 'טוען…'}
        />
        <KpiTile
          icon={PiggyBank}
          tone="text-success"
          label="עמלה חודשית צפויה"
          value={perf ? formatILS(perf.revenue.projected_monthly) : null}
          hint={
            perf
              ? `${perf.revenue.projected_monthly_count} עסקאות שצפויות להיסגר החודש`
              : 'טוען…'
          }
        />
        <KpiTile
          icon={Trophy}
          tone="text-warning"
          label="הכנסות שנסגרו"
          value={perf ? formatILS(perf.revenue.closed_value) : null}
          hint={perf ? `${perf.revenue.closed_count} עסקאות נסגרו` : 'טוען…'}
        />
        <KpiTile
          icon={Target}
          tone="text-foreground"
          label="שיעור המרה כולל"
          value={perf ? `${conversionRate}%` : null}
          hint="איש קשר → עסקה סגורה"
        />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-primary" />
            משפך המכירות
          </CardTitle>
          <Badge variant="outline" className="font-normal text-[11px]">
            {perf ? `חלון: ${perf.window_days} ימים` : '…'}
          </Badge>
        </CardHeader>
        <CardContent>
          {perfLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : perfError ? (
            <div className="text-sm text-destructive">
              שגיאה בטעינת הנתונים: {(perfError as Error).message}
            </div>
          ) : !perf || funnelData.every((d) => d.value === 0) ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              אין מספיק נתונים להצגת המשפך עדיין.
            </div>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 24, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      formatter={(v: number) => [v, 'אנשי קשר']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {funnelData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
                {funnelData.map((d, i) => {
                  const prev = i > 0 ? funnelData[i - 1].value : null;
                  const dropoff =
                    prev != null && prev > 0
                      ? Math.round((d.value / prev) * 100)
                      : null;
                  return (
                    <div key={d.key} className="rounded-md border p-2.5">
                      <div className="text-[11px] text-muted-foreground">{d.label}</div>
                      <div className="text-lg font-semibold tabular-nums">{d.value}</div>
                      {dropoff != null && (
                        <div className="text-[10px] text-muted-foreground">
                          {dropoff}% מהשלב הקודם
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Channel efficiency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            זמן הסמכה ממוצע לפי ערוץ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {perfLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !perf || perf.efficiency.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              עדיין אין נתוני הסמכה. תייג אנשי קשר כ"מוסמך" כדי שהמערכת תחשב את הזמן הממוצע.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {perf.efficiency.map((row) => (
                <div key={row.channel} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">
                      {CHANNEL_LABEL_HE[row.channel] || row.channel}
                    </div>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {row.qualified_count} מוסמכים
                    </Badge>
                  </div>
                  <div className="text-xl font-semibold mt-1.5 tabular-nums">
                    {formatHours(row.avg_hours)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    איש קשר → מוסמך
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission attribution editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            ייחוס הכנסות (עמלה לכל איש קשר)
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            הקלד עמלה משוערת ותאריך סגירה כדי להזין את הצפי החודשי
          </p>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !leadsForCommission || leadsForCommission.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              אין אנשי קשר בחלון הזמן הנוכחי.
            </div>
          ) : (
            <ScrollArea className="h-80">
              <div className="space-y-2 pe-2">
                {leadsForCommission.map((l) => {
                  const stageBadge = stageLabel(l.lead_stage, l.interaction_outcome);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {l.full_name || 'איש קשר ללא שם'}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {stageBadge && (
                            <Badge variant="outline" className={cn('text-[10px]', stageBadge.tone)}>
                              {stageBadge.label}
                            </Badge>
                          )}
                          {l.expected_close_date && (
                            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                              <CalendarRange className="h-3 w-3" />
                              {new Date(l.expected_close_date).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {l.commission_amount != null ? (
                          <div className="text-sm font-semibold tabular-nums">
                            {formatILS(l.commission_amount)}
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground">לא הוגדר</div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingLead({
                            id: l.id,
                            full_name: l.full_name,
                            commission_amount: l.commission_amount,
                            expected_close_date: l.expected_close_date,
                          })
                        }
                      >
                        ערוך
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {editingLead && (
        <CommissionEditor
          open={!!editingLead}
          onOpenChange={(o) => !o && setEditingLead(null)}
          lead={editingLead}
        />
      )}
    </div>
  );
}

function stageLabel(
  stage: string | null,
  outcome: string | null,
): { label: string; tone: string } | null {
  if (outcome === 'Closed Won' || stage === 'closed') return { label: 'נסגרה', tone: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
  if (outcome === 'Closed Lost') return { label: 'אבדה', tone: 'bg-rose-500/10 text-rose-600 border-rose-500/30' };
  if (outcome === 'Ghosted') return { label: 'נעלם', tone: 'bg-slate-500/10 text-slate-600 border-slate-500/30' };
  if (stage === 'negotiation' || stage === 'awaiting_signature') return { label: 'משא ומתן', tone: 'bg-orange-500/10 text-orange-600 border-orange-500/30' };
  if (outcome === 'Meeting Scheduled') return { label: 'פגישה נקבעה', tone: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
  if (stage === 'qualified' || outcome === 'Qualified') return { label: 'מוסמך', tone: 'bg-blue-500/10 text-blue-600 border-blue-500/30' };
  if (stage === 'followup') return { label: 'מעקב', tone: 'bg-muted text-muted-foreground border-muted' };
  return { label: 'חדש', tone: 'bg-muted text-muted-foreground border-muted' };
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
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={cn('h-4 w-4', tone)} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
          {value === null ? <Skeleton className="h-7 w-24" /> : value}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
      </CardContent>
    </Card>
  );
}
