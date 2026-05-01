import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ShieldCheck, ShieldAlert, Users, Activity, ServerCog, Search, Wallet, Bot, ExternalLink, ArrowRight, RadioTower, Flame, Crown, Gauge, BrainCircuit, MessageCircle, RotateCcw, PlugZap, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { FinanceTab } from '@/components/admin/FinanceTab';
import { TestTrialModeCard } from '@/components/admin/TestTrialModeCard';
import { DEMO_CANDIDATES } from '@/lib/demoData';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  is_suspended: boolean;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
}

interface LeadRow {
  id: string;
  email: string | null;
  phone_number: string | null;
  created_at: string;
  archetype: string | null;
  value_trap_type: string | null;
  engagement_score: number;
}

interface DemoSessionRow {
  session_id: string;
  current_route: string;
  archetype: string | null;
  last_seen_at: string;
}

const ROLE_OPTIONS: AppRole[] = ['user', 'moderator', 'admin', 'super_admin'];
const PREMIUM_COLORS = ['hsl(var(--primary))', 'hsl(var(--primary-glow))', 'hsl(var(--muted-foreground))'];

const FEATURE_HEATMAP = [
  { page: 'Sentiment', visits: 186, share: 46, intent: 'בדיקת מומנטום ציבורי' },
  { page: 'CRM', visits: 143, share: 35, intent: 'איתור קהלים חמים' },
  { page: 'Calendar', visits: 78, share: 19, intent: 'תכנון מסרי ניצחון' },
];

const ARCHETYPE_DATA = [
  { name: 'יו״ר מפלגה ארצית', value: 44 },
  { name: 'חבר כנסת בפריימריז', value: 31 },
  { name: 'נכס לראשות עיר', value: 25 },
];

const DEMO_STORAGE_KEYS = ['kalpiz-demo-mode', 'kalpiz-demo-listing', 'kalpiz-demo-session-id', 'kalpiz_demo_notifications', 'kalpiz_viewed_notifs', 'kalpiz_demo_notif_muted', 'kalpiz_dismissed_budgets', 'kalpiz-authenticated-session'];

const clearDemoBrowserState = () => {
  DEMO_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  });
};

const SuperAdmin = () => {
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState<Record<'whatsapp' | 'ai', 'idle' | 'checking' | 'online' | 'degraded'>>({ whatsapp: 'idle', ai: 'idle' });

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['admin-all-roles'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('user_id, role');
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-system-stats'],
    enabled: isSuperAdmin,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [v, m, c, s] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }),
        supabase.from('social_connections').select('id', { count: 'exact', head: true }).eq('is_connected', true),
      ]);
      return {
        voters: v.count ?? 0,
        messages: m.count ?? 0,
        campaigns: c.count ?? 0,
        connections: s.count ?? 0,
      };
    },
  });

  const { data: demoSessions } = useQuery({
    queryKey: ['admin-demo-sessions'],
    enabled: isSuperAdmin,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('demo_sessions')
        .select('session_id, current_route, archetype, last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(500);
      return (data ?? []) as DemoSessionRow[];
    },
  });

  const { data: capturedLeads } = useQuery({
    queryKey: ['admin-captured-leads'],
    enabled: isSuperAdmin,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('demo_captured_leads')
        .select('id, email, phone_number, created_at, archetype, value_trap_type, engagement_score')
        .order('created_at', { ascending: false })
        .limit(30);
      return (data ?? []) as LeadRow[];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ['admin-audit'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const { data: globalActivity } = useQuery({
    queryKey: ['admin-global-monitoring'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await (supabase as any).from('interaction_activity_log').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: connectionHealth, refetch: refetchConnectionHealth } = useQuery({
    queryKey: ['admin-connection-health'],
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('admin_leads')
        .select('id, user_id, user_email, status, metadata, created_at')
        .eq('lead_type', 'connection_health')
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(100);
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        user_email: string | null;
        status: string;
        created_at: string;
        metadata: Record<string, any>;
      }>;
    },
  });

  const runMonitorNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('monitor-social-connections', { body: { source: 'manual' } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const alerts = data?.alerts ?? 0;
      toast.success(`נסרקו ${data?.scanned ?? 0} חיבורים · ${alerts} התראות חדשות`);
      refetchConnectionHealth();
    },
    onError: (e: any) => toast.error(e?.message ?? 'הרצת ניטור נכשלה'),
  });

  const resolveHealthAlert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_leads').update({ status: 'resolved' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('התראה סומנה כטופלה');
      refetchConnectionHealth();
    },
    onError: (e: any) => toast.error(e?.message ?? 'עדכון נכשל'),
  });

  const toggleRole = useMutation({
    mutationFn: async ({ userId, role, enable }: { userId: string; role: AppRole; enable: boolean }) => {
      const query = enable ? supabase.from('user_roles').insert({ user_id: userId, role }) : supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-all-roles'] });
      toast.success('הרשאה עודכנה');
    },
    onError: (e: Error) => toast.error(e.message || 'שגיאה בעדכון הרשאה'),
  });

  const toggleSuspend = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      const { error } = await supabase.from('profiles').update({ is_suspended: suspend }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success('סטטוס המשתמש עודכן');
    },
    onError: () => toast.error('עדכון סטטוס נכשל'),
  });

  const resetSimulation = useMutation({
    mutationFn: async () => {
      const [leadsResult, sessionsResult] = await Promise.all([
        (supabase as any).from('demo_captured_leads').delete().not('id', 'is', null),
        (supabase as any).from('demo_sessions').delete().not('id', 'is', null),
      ]);
      if (leadsResult.error) throw leadsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      clearDemoBrowserState();
      window.localStorage.setItem('kalpiz-demo-mode', 'true');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-demo-sessions'] });
      qc.invalidateQueries({ queryKey: ['admin-captured-leads'] });
      qc.invalidateQueries({ queryKey: ['admin-system-stats'] });
      toast.success('הסימולציה אותחלה בהצלחה');
      navigate('/dashboard?demo=true');
    },
    onError: (e: Error) => toast.error(e.message || 'איפוס הסימולציה נכשל'),
  });

  const checkHealth = async (service: 'whatsapp' | 'ai', enabled: boolean) => {
    if (!enabled) {
      setHealth((current) => ({ ...current, [service]: 'idle' }));
      return;
    }
    setHealth((current) => ({ ...current, [service]: 'checking' }));
    try {
      if (service === 'whatsapp') {
        const { count, error } = await supabase.from('social_connections').select('id', { count: 'exact', head: true }).eq('is_connected', true);
        if (error) throw error;
        setHealth((current) => ({ ...current, whatsapp: (count ?? 0) > 0 ? 'online' : 'degraded' }));
      } else {
        const { error } = await supabase.functions.invoke('executive-summary');
        setHealth((current) => ({ ...current, ai: error ? 'degraded' : 'online' }));
      }
    } catch {
      setHealth((current) => ({ ...current, [service]: 'degraded' }));
    }
  };

  const rolesByUser = useMemo(() => {
    const map = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.role]));
    return map;
  }, [roles]);

  const filtered = (profiles ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.email ?? '').toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q);
  });

  const liveDemoUsers = (demoSessions ?? []).filter((session) => Date.now() - new Date(session.last_seen_at).getTime() < 2 * 60 * 1000).length;
  const archetypeCounts = (demoSessions ?? []).reduce<Record<string, number>>((acc, session) => {
    const key = session.archetype || 'לא נבחר';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const archetypeBreakdown = Object.entries(archetypeCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const topArchetype = archetypeBreakdown[0]?.name ?? 'ממתין לנתונים';

  if (roleLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto mt-20 max-w-xl" dir="rtl">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" /> גישה נדחתה</CardTitle><CardDescription>עמוד זה זמין רק לסופר-אדמינים.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ─── Hero (matches dashboard: centered title only) ─── */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          מרכז שליטה סופר-אדמין
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מודיעין דמו, לידים חמים ובריאות מערכות לקראת פגישות מכירה מנצחות.
        </p>
      </div>

      {/* ─── Action bar (Reset only) ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4" /> איפוס סימולציה
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl" className="border-destructive/25">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
              <AlertDialogDescription>פעולה זו תנקה את כל נתוני הדמו והלידים שנאספו.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:justify-start">
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => resetSimulation.mutate()}
                disabled={resetSimulation.isPending}
              >
                {resetSimulation.isPending ? 'מאפס...' : 'אפס סימולציה'}
              </AlertDialogAction>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>


      <div className="grid gap-4 md:grid-cols-4">
        <PremiumStat icon={RadioTower} label="Live Demo Users" value={liveDemoUsers} hint="/dashboard?demo=true" />
        <PremiumStat icon={Flame} label="עמוד מוביל" value="Sentiment" hint="46% מצפיות הדמו" />
        <PremiumStat icon={Crown} label="ארכיטיפ מוביל" value={topArchetype} hint="מכירות דמו בפועל" />
        <PremiumStat icon={Gauge} label="לידים שנלכדו" value={capturedLeads?.length ?? 0} hint="Send Report traps" />
      </div>

      <Tabs defaultValue="intelligence" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="intelligence"><BrainCircuit className="ml-2 h-4 w-4" /> Intelligence Center</TabsTrigger>
          <TabsTrigger value="leads"><MessageCircle className="ml-2 h-4 w-4" /> Captured Prospects</TabsTrigger>
          <TabsTrigger value="users"><Users className="ml-2 h-4 w-4" /> משתמשים</TabsTrigger>
          <TabsTrigger value="finance"><Wallet className="ml-2 h-4 w-4" /> פיננסי</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="ml-2 h-4 w-4" /> פעילות</TabsTrigger>
          <TabsTrigger value="monitoring"><Bot className="ml-2 h-4 w-4" /> ניטור</TabsTrigger>
          <TabsTrigger value="connections">
            <PlugZap className="ml-2 h-4 w-4" /> חיבורים
            {(connectionHealth?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="mr-2 h-4 px-1.5 text-[10px]">{connectionHealth!.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="system"><ServerCog className="ml-2 h-4 w-4" /> סטטוס</TabsTrigger>
        </TabsList>

        <TabsContent value="intelligence" className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card><CardHeader><CardTitle>Feature Popularity Heatmap</CardTitle><CardDescription>העמודים שהכי משכנעים משתמשי דמו להמשיך במסע.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>עמוד</TableHead><TableHead>ביקורים</TableHead><TableHead>חום</TableHead><TableHead>כוונת משתמש</TableHead></TableRow></TableHeader><TableBody>{FEATURE_HEATMAP.map((row) => <TableRow key={row.page}><TableCell className="font-bold text-primary">{row.page}</TableCell><TableCell className="tabular-nums">{row.visits}</TableCell><TableCell><div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${row.share}%` }} /></div></TableCell><TableCell className="text-muted-foreground">{row.intent}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle>Listing Outreach Archetype Breakdown</CardTitle><CardDescription>איזה תרחיש מכירה נבחר הכי הרבה בדמו.</CardDescription></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={archetypeBreakdown.length ? archetypeBreakdown : ARCHETYPE_DATA} dataKey="value" nameKey="name" innerRadius={62} outerRadius={94} paddingAngle={4}>{(archetypeBreakdown.length ? archetypeBreakdown : ARCHETYPE_DATA).map((entry, index) => <Cell key={entry.name} fill={PREMIUM_COLORS[index % PREMIUM_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
          <Card className="lg:col-span-2"><CardHeader><CardTitle>Demo Flow Velocity</CardTitle><CardDescription>מדד 60fps קליל המבוסס על נתוני דמו מצטברים.</CardDescription></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={FEATURE_HEATMAP}><XAxis dataKey="page" /><YAxis /><Tooltip /><Bar dataKey="visits" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></CardContent></Card>
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <Card><CardHeader><CardTitle>Captured Leads</CardTitle><CardDescription>לידים שנלכדו מ-Send Report value traps בדמו.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Email / Phone</TableHead><TableHead>זמן כניסה</TableHead><TableHead>ארכיטיפ</TableHead><TableHead>Engagement</TableHead></TableRow></TableHeader><TableBody>{(capturedLeads ?? []).map((lead, index) => <TableRow key={lead.id}><TableCell><div className="font-mono text-xs">{lead.email || lead.phone_number}</div><div className="text-xs text-muted-foreground">{lead.value_trap_type || 'send_report'}</div></TableCell><TableCell>{format(new Date(lead.created_at), 'dd/MM HH:mm')}</TableCell><TableCell><Badge variant="secondary">{lead.archetype || DEMO_CANDIDATES[index % DEMO_CANDIDATES.length]?.name}</Badge></TableCell><TableCell><span className="font-black tabular-nums text-primary">{lead.engagement_score}</span></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          <TestTrialModeCard />
          <Card><CardHeader className="pb-3"><CardTitle>כל המשתמשים</CardTitle><CardDescription>צפה בכל המשתמשים, נהל הרשאות והשעה גישה</CardDescription></CardHeader><CardContent><div className="relative mb-4"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש לפי אימייל או שם..." className="pr-9" /></div>{profilesLoading ? <Skeleton className="h-64 w-full" /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>אימייל</TableHead><TableHead>שם מלא</TableHead><TableHead>הרשמה</TableHead><TableHead>הרשאות</TableHead><TableHead>פעיל</TableHead><TableHead>פעולות</TableHead></TableRow></TableHeader><TableBody>{filtered.map((p) => { const userRoles = rolesByUser.get(p.id) ?? []; return <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.email ?? '-'}</TableCell><TableCell>{p.full_name || '-'}</TableCell><TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy')}</TableCell><TableCell><div className="flex flex-wrap gap-1">{userRoles.length === 0 && <Badge variant="outline">user</Badge>}{userRoles.map((r) => <Badge key={r} variant={r === 'super_admin' ? 'default' : 'secondary'}>{r}</Badge>)}</div></TableCell><TableCell><Switch checked={!p.is_suspended} onCheckedChange={(v) => toggleSuspend.mutate({ id: p.id, suspend: !v })} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{ROLE_OPTIONS.map((role) => { const has = userRoles.includes(role); return <Button key={role} size="sm" variant={has ? 'default' : 'outline'} className="h-7 px-2 text-[10px]" onClick={() => toggleRole.mutate({ userId: p.id, role, enable: !has })}>{has ? '−' : '+'} {role}</Button>; })}</div></TableCell></TableRow>; })}{filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">לא נמצאו משתמשים</TableCell></TableRow>}</TableBody></Table></div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="finance" className="mt-4"><FinanceTab /></TabsContent>
        <TabsContent value="activity" className="mt-4"><Card><CardHeader><CardTitle>יומן פעילות אחרון</CardTitle><CardDescription>50 הפעולות האחרונות במערכת</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>זמן</TableHead><TableHead>משתמש</TableHead><TableHead>פעולה</TableHead><TableHead>יעד</TableHead></TableRow></TableHeader><TableBody>{(audit ?? []).map((a: any) => <TableRow key={a.id}><TableCell className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'dd/MM HH:mm')}</TableCell><TableCell className="font-mono text-xs">{a.actor_email || a.actor_id?.slice(0, 8)}</TableCell><TableCell><Badge variant="outline">{a.action}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{a.target_table ? `${a.target_table}/${(a.target_id || '').slice(0, 8)}` : '-'}</TableCell></TableRow>)}{(!audit || audit.length === 0) && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">אין רשומות</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
        <TabsContent value="monitoring" className="mt-4"><Card><CardHeader><CardTitle>Global Monitoring</CardTitle><CardDescription>היסטוריית אינטראקציות מכל הערוצים.</CardDescription></CardHeader><CardContent className="space-y-3">{(globalActivity ?? []).map((row: any) => <div key={row.id} className="rounded-md border border-border/60 bg-background p-3"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={row.actor_type === 'ai_agent' ? 'secondary' : 'default'}>{row.actor_type === 'ai_agent' ? 'AI Agent' : 'Supervisor'}</Badge><Badge variant="outline">{row.platform}</Badge><span className="text-xs text-muted-foreground">{format(new Date(row.created_at), 'dd/MM HH:mm')}</span>{row.live_post_url && <Button asChild size="sm" variant="ghost" className="h-7"><a href={row.live_post_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> פוסט חי</a></Button>}</div><p className="whitespace-pre-wrap text-sm">{row.content}</p></div>)}{(!globalActivity || globalActivity.length === 0) && <p className="py-8 text-center text-sm text-muted-foreground">אין עדיין פעילות גלובלית</p>}</CardContent></Card></TabsContent>
        <TabsContent value="connections" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <PlugZap className="h-4 w-4 text-primary" /> בריאות חיבורים חברתיים
                </CardTitle>
                <CardDescription>
                  סריקה יומית אוטומטית (06:00 UTC) של כל חיבורי Google ו-LinkedIn. כל אזהרה כאן = פעולה נדרשת מצד המשתמש.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runMonitorNow.mutate()}
                disabled={runMonitorNow.isPending}
                className="shrink-0"
              >
                {runMonitorNow.isPending ? <RefreshCw className="ml-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-1 h-3.5 w-3.5" />}
                הרץ סריקה עכשיו
              </Button>
            </CardHeader>
            <CardContent>
              {(connectionHealth?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> כל החיבורים תקינים. אין התראות פתוחות.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>זוהה</TableHead>
                      <TableHead>משתמש</TableHead>
                      <TableHead>פלטפורמה</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead>פירוט</TableHead>
                      <TableHead>פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(connectionHealth ?? []).map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(alert.created_at), 'dd/MM HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{alert.user_email ?? alert.user_id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{alert.metadata?.platform ?? '-'}</Badge>
                          {alert.metadata?.display_name && (
                            <span className="mr-2 text-xs text-muted-foreground">{alert.metadata.display_name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> {alert.metadata?.probe_status ?? 'broken'}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                          {alert.metadata?.probe_message ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => resolveHealthAlert.mutate(alert.id)}
                            disabled={resolveHealthAlert.isPending}
                          >
                            סמן כטופלה
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-4 space-y-4"><div className="grid gap-4 md:grid-cols-4"><StatCard label="סה״כ לידים" value={stats?.voters ?? 0} /><StatCard label="הודעות" value={stats?.messages ?? 0} /><StatCard label="קמפיינים" value={stats?.campaigns ?? 0} /><StatCard label="חיבורים פעילים" value={stats?.connections ?? 0} /></div><Card><CardHeader><CardTitle>System Status</CardTitle><CardDescription>בדיקת בריאות ל-WhatsApp ולמנועי AI בזמן פגישה.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><HealthToggle label="WhatsApp Gateway" status={health.whatsapp} onChange={(v) => checkHealth('whatsapp', v)} /><HealthToggle label="AI Engines" status={health.ai} onChange={(v) => checkHealth('ai', v)} /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
};

function PremiumStat({ icon: Icon, label, value, hint }: { icon: typeof ShieldCheck; label: string; value: number | string; hint: string }) {
  return <Card className="border-primary/15 bg-card shadow-[0_18px_50px_-36px_hsl(var(--primary))]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><p className="text-2xl font-black tabular-nums text-primary">{typeof value === 'number' ? value.toLocaleString() : value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-primary">{value.toLocaleString()}</p></CardContent></Card>;
}

function HealthToggle({ label, status, onChange }: { label: string; status: 'idle' | 'checking' | 'online' | 'degraded'; onChange: (v: boolean) => void }) {
  const text = status === 'checking' ? 'בודק' : status === 'online' ? 'תקין' : status === 'degraded' ? 'דורש בדיקה' : 'כבוי';
  return <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-4"><div><p className="font-bold">{label}</p><Badge variant={status === 'online' ? 'default' : status === 'degraded' ? 'destructive' : 'secondary'}>{text}</Badge></div><Switch checked={status === 'online' || status === 'checking'} onCheckedChange={onChange} /></div>;
}

export default SuperAdmin;
