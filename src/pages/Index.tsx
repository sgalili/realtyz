import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  UsersRound, HeartHandshake, Send, Target, BarChart3, MessageSquareText, AlertTriangle, HelpCircle,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useElectionType } from '@/hooks/useElectionType';
import { format, subDays, startOfDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { NextMilestoneWidget } from '@/components/dashboard/NextMilestoneWidget';
import { LiveActivityFeed } from '@/components/dashboard/LiveActivityFeed';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoTicker } from '@/hooks/useDemoTicker';
import { useAuth } from '@/hooks/useAuth';
import { DEMO_CAMPAIGNS, getDemoCandidateCrisisAlerts, getDemoCandidateSummary, getDemoCandidateSurveyInsights, getDemoCandidateVoters } from '@/lib/demoData';
import { VOTES_PER_MANDATE } from '@/lib/mandateCalculator';
import { useMandate } from '@/hooks/useMandate';
import { Progress } from '@/components/ui/progress';

interface ExecSummary {
  totalVoters: number;
  supporters: number;
  mandateTarget: number;
  targetVotes: number;
  sentimentBreakdown: { positive: number; negative: number; neutral: number };
  cityClusters: { city: string; count: number }[];
  narrative: string;
}

const PIE_COLORS = ['hsl(213 70% 45%)', 'hsl(213 70% 60%)', 'hsl(213 50% 75%)', 'hsl(213 30% 85%)', 'hsl(43 90% 60%)', 'hsl(152 60% 50%)'];

const Dashboard = () => {
  const { terms } = useElectionType();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const { user } = useAuth();
  const demoTicker = useDemoTicker();
  const { selectedMandates, quota } = useMandate();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['executive-summary'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('executive-summary');
      if (error) throw error;
      return data as ExecSummary;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // 7-day registrations
  const { data: weekly } = useQuery({
    queryKey: ['voters-7day'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const since = subDays(new Date(), 6).toISOString();
      const { data } = await supabase
        .from('voters')
        .select('created_at')
        .gte('created_at', since);
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const k = format(subDays(new Date(), i), 'dd/MM');
        buckets[k] = 0;
      }
      (data ?? []).forEach((v) => {
        if (!v.created_at) return;
        const k = format(new Date(v.created_at), 'dd/MM');
        if (k in buckets) buckets[k]++;
      });
      return Object.entries(buckets).map(([day, count]) => ({ day, count }));
    },
    staleTime: 60_000,
  });

  // Recent voters
  const { data: recentVoters } = useQuery({
    queryKey: ['recent-voters'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('voters')
        .select('id, full_name, phone_number, city, created_at')
        .order('created_at', { ascending: false })
        .limit(6);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Active campaigns
  const { data: campaigns } = useQuery({
    queryKey: ['active-campaigns'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('id, name, total_sent, total_clicks, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: surveyInsights } = useQuery({
    queryKey: ['dashboard-survey-insights', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('survey_insights')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const { data: crisisAlerts } = useQuery({
    queryKey: ['dashboard-crisis-alerts', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('crisis_alerts')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(3);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const demoSummary = getDemoCandidateSummary(demoCandidateId);
  const demoVoters = getDemoCandidateVoters(demoCandidateId);
  const activeSummary = isDemoMode ? demoSummary : summary;
  const activeWeekly = isDemoMode
    ? [124, 168, 221, 312, 405, 510, 684].map((count, i) => ({ day: format(subDays(new Date(), 6 - i), 'dd/MM'), count }))
    : weekly;
  const activeRecentVoters = isDemoMode
    ? demoVoters.slice(0, 6).map((v, index) => ({
      ...demoVoters[(index + demoTicker.totalVoters) % demoVoters.length],
      created_at: new Date(Date.now() - index * 75_000).toISOString(),
    }))
    : recentVoters;
  const activeCampaigns = isDemoMode
    ? DEMO_CAMPAIGNS.filter((c) => c.status === 'active').slice(0, 5).map((c, index) => ({
      ...c,
      total_sent: (c.total_sent ?? 0) + Math.floor(demoTicker.sentBonus / (index + 1)),
      total_clicks: (c.total_clicks ?? 0) + Math.floor(demoTicker.clickBonus / (index + 1)),
    }))
    : campaigns;
  const activeSurveyInsights = isDemoMode
    ? getDemoCandidateSurveyInsights(demoCandidateId)
    : surveyInsights ?? [];
  const activeCrisisAlerts = isDemoMode
    ? getDemoCandidateCrisisAlerts(demoCandidateId)
    : crisisAlerts ?? [];
  const demoBotComments = ['אותו טקסט מועתק מ-12 חשבונות חדשים', 'קישור חשוד חוזר בתגובות', 'תגובה אגרסיבית ללא פרטים או הקשר'];

  const interestPie = (activeSummary?.cityClusters ?? [])
    .slice(0, 6)
    .map((c) => ({ name: c.city, value: c.count }));

  // In demo mode, mandate target follows the global selector so quotas stay in sync.
  // In live mode, demoSummary.mandateTarget falls back to the user's saved target.
  const totalVoters = isDemoMode ? quota.voterPool : activeSummary?.totalVoters ?? 0;
  const supporters = isDemoMode
    ? Math.round(quota.predictedVotes * 0.45)
    : activeSummary?.supporters ?? 0;
  const mandateTarget = isDemoMode ? selectedMandates : activeSummary?.mandateTarget ?? 1;
  const targetVotes = isDemoMode ? quota.predictedVotes : (activeSummary?.targetVotes ?? mandateTarget * VOTES_PER_MANDATE);
  const progressPct = Math.min(Math.round((supporters / Math.max(1, targetVotes)) * 100), 100);
  const activeCampaignCount = isDemoMode ? 8 : activeCampaigns?.length ?? 0;
  const touchpoints = isDemoMode
    ? demoTicker.touchpoints
    : (activeCampaigns ?? []).reduce((sum, campaign) => sum + (campaign.total_sent ?? 0) + (campaign.total_clicks ?? 0), 0);

  // AI Voice usage simulated as ~25% of the quota during demo so the meter is alive.
  const aiVoiceUsed = isDemoMode
    ? Math.round(quota.aiVoiceMinutes * 0.27 + (demoTicker.touchpoints % 120))
    : 0;
  const aiVoicePct = Math.min(100, Math.round((aiVoiceUsed / Math.max(1, quota.aiVoiceMinutes)) * 100));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">לוח בקרה</h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mx-auto flex h-14 w-fit justify-center gap-2 px-2">
          <TabsTrigger value="overview" className="h-11 px-6 text-lg"><Target className="h-6 w-6 ml-3" /> תמונת מצב</TabsTrigger>
          <TabsTrigger value="surveys" className="h-11 px-6 text-lg"><BarChart3 className="h-6 w-6 ml-3" /> תובנות סקרים</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
      <Card>
        <CardContent className="p-4">
          <LiveActivityFeed />
        </CardContent>
      </Card>

      {/* 4-stat grid - all values key on selectedMandates so they fade-in on change */}
      <div key={`stats-${selectedMandates}`} className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <StatCard icon={HeartHandshake} label={`${terms.supporters} מאומתים`} value={supporters} loading={isLoading} accent="green" suffix={` ${terms.votes}`} tooltip={`מספר ה${terms.supporters} המאומתים שמזוהים במערכת כ${terms.votes} זמינים לקמפיין.`} to="/voter-crm?status=supporter" />
        <StatCard icon={UsersRound} label="מאגר פעיל" value={totalVoters} loading={isLoading} accent="blue" suffix={` ${terms.votes}`} tooltip="המאגר הפעיל - האנשים שאנחנו מטרגטים כרגע כדי להגיע לאבן הדרך הבאה ביעד." to="/voter-crm" />
        <StatCard icon={Target} label={terms.target} value={mandateTarget} loading={isLoading} accent="primary" suffix={` · ${progressPct}% התקדמות`} suffixClassName="text-sm font-bold text-muted-foreground sm:text-base" tooltip={`יעד ה${terms.seats} של הקמפיין וההתקדמות הנוכחית ביחס לכמות ה${terms.votes} הנדרשת.`} to="/finance" />
        <StatCard icon={Send} label="קמפיינים בביצוע" value={activeCampaignCount} loading={isLoading} accent="amber" tooltip="מספר הקמפיינים הפעילים או האחרונים שנמצאים כרגע בביצוע." to="/campaigns?tab=campaigns&status=active" />
      </div>

      {/* Quota & Budget panel - reactive to selectedMandates */}
      <div key={`quota-${selectedMandates}`} className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in">
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">מכסת דקות AI Voice</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-bold text-primary transition-all duration-500">{aiVoiceUsed.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">/ {quota.aiVoiceMinutes.toLocaleString()} דק'</span>
            </div>
            <Progress value={aiVoicePct} className="mt-3 h-2 transition-all duration-500" />
            <p className="mt-2 text-xs text-muted-foreground">{quota.seats} משתמשים · קהל {quota.voterPool.toLocaleString()}{selectedMandates > 10 ? ` · +${(selectedMandates - 10) * 500} דק' דינמיות` : ''}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{terms.votes} צפויים ביעד</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-bold text-primary transition-all duration-500">{quota.predictedVotes.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">{terms.votes}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">לפי {terms.votesPerUnit.toLocaleString()} {terms.votes} ל{terms.seat} · {selectedMandates} {terms.seats}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">תקציב חודשי משוער</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-bold text-primary transition-all duration-500">₪{quota.monthlyPrice.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">/ חודש</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {quota.audienceScalingFee > 0
                ? `כולל תוספת קנה־מידה ₪${quota.audienceScalingFee.toLocaleString()}`
                : 'מבוסס על נוסחת monthlyPackagePrice'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Next Milestone */}
      <NextMilestoneWidget />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">הרשמות 7 ימים אחרונים</CardTitle>
            <CardDescription>מספר {terms.voters} חדשים לפי יום</CardDescription>
          </CardHeader>
          <CardContent>
            {!activeWeekly ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={activeWeekly}>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">התפלגות לפי ערים</CardTitle>
              <CardDescription className="text-xs">6 הערים המובילות</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!activeSummary ? (
              <Skeleton className="h-[240px] w-full" />
            ) : interestPie.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">אין נתונים גיאוגרפיים</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={interestPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="44%"
                    outerRadius={76}
                    labelLine={false}
                  >
                    {interestPie.map((_, i) => (
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

      {/* Recent voters + active campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{terms.voters} שנרשמו לאחרונה</CardTitle>
          </CardHeader>
          <CardContent>
            {!activeRecentVoters ? (
              <Skeleton className="h-40 w-full" />
            ) : activeRecentVoters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין נתונים</p>
            ) : (
              <div className="space-y-2">
                {activeRecentVoters.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{v.full_name || 'ללא שם'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatPhoneDisplay(v.phone_number)}
                        {v.city && ` · ${v.city}`}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {v.created_at && format(new Date(v.created_at), 'dd/MM HH:mm', { locale: he })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">קמפיינים אחרונים</CardTitle>
          </CardHeader>
          <CardContent>
            {!activeCampaigns ? (
              <Skeleton className="h-40 w-full" />
            ) : activeCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין קמפיינים פעילים</p>
            ) : (
              <div className="space-y-2">
                {activeCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(c.total_sent ?? 0).toLocaleString()} נשלחו · {(c.total_clicks ?? 0).toLocaleString()} קליקים
                      </p>
                    </div>
                    <TooltipProvider delayDuration={120}>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {c.total_sent && c.total_clicks
                              ? `שיעור הקלקה ${Math.round((c.total_clicks / c.total_sent) * 100)}%`
                              : 'אין נתון'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          <p className="max-w-48 text-xs">אחוז ההקלקות מתוך כלל ההודעות שנשלחו בקמפיין</p>
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="surveys" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(activeSurveyInsights as any[]).map((insight) => (
              <Card key={insight.id} className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> {insight.title}</CardTitle>
                  <CardDescription>{insight.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold mb-2">מה הבוחרים רוצים עכשיו</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(insight.top_concerns ?? []).slice(0, 5).map((item: any, i: number) => <Badge key={i} variant="secondary">{item.label ?? item.concern ?? String(item)}</Badge>)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" /> נקודת חולשה</p>
                    <p className="text-sm text-muted-foreground mt-1">{(insight.weak_points ?? [])[0] ?? 'אין נקודת חולשה בולטת'}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5"><MessageSquareText className="h-3.5 w-3.5 text-primary" /> AI Message Refiner</p>
                    <p className="text-sm mt-1">{(insight.message_recommendations ?? [])[0]?.script ?? 'העלה סקר כדי לקבל נוסח WhatsApp/SMS מותאם לפי אזור וקהל.'}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {activeSurveyInsights.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">אין תובנות סקרים עדיין. העלה קובץ במאגר הידע כדי להתחיל.</CardContent></Card>}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function StatCard({
  label, value, loading, suffix, suffixClassName, tooltip, to,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  loading?: boolean;
  accent: 'blue' | 'green' | 'amber' | 'primary';
  suffix?: string;
  suffixClassName?: string;
  tooltip: string;
  to?: string;
}) {
  const navigate = useNavigate();
  return (
    <TooltipProvider delayDuration={120}>
      <UiTooltip>
        <Card
          dir="rtl"
          onClick={to ? () => navigate(to) : undefined}
          role={to ? 'button' : undefined}
          tabIndex={to ? 0 : undefined}
          onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to); } } : undefined}
          className={`relative overflow-hidden border border-border/80 bg-card shadow-sm ${to ? 'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`}
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
          <CardContent className="flex flex-col items-center gap-1.5 px-3 py-2.5 text-center sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center justify-center">
              <p className="min-w-0 text-center text-sm font-medium leading-none text-muted-foreground sm:text-[15px]">{label}</p>
            </div>
            <div className="flex items-center justify-center w-full">
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="flex flex-wrap items-baseline justify-center gap-1 text-center text-2xl font-black leading-tight tracking-normal text-primary tabular-nums sm:text-[28px]" dir="rtl">
                <span dir="ltr">{value.toLocaleString()}</span>
                {suffix && <span className={suffixClassName ?? "text-lg font-bold text-muted-foreground sm:text-xl"}>{suffix.trimStart()}</span>}
              </p>
            )}
            </div>
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
