import { useState } from 'react';
import { GoLoginTokenCard } from '@/components/admin/GoLoginTokenCard';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useSearchParams } from 'react-router-dom';
import { resolveAdminSection, type AdminSection } from '@/lib/superAdminSections';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Bot, ExternalLink, PlugZap, AlertTriangle, RefreshCw, CheckCircle2, History } from 'lucide-react';
import { FinanceTab } from '@/components/admin/FinanceTab';
import { BrokerUpgradeRequestsCard } from '@/components/admin/BrokerUpgradeRequestsCard';
import { BrokerBatchImportCard } from '@/components/admin/BrokerBatchImportCard';
import { BrokerContactQueueCard } from '@/components/admin/BrokerContactQueueCard';
import { SuperAdminDeleteUsersCard } from '@/components/admin/SuperAdminDeleteUsersCard';
import { SuperAdminUsersTable } from '@/components/admin/SuperAdminUsersTable';
import { DeletedAccountsArchive } from '@/components/admin/DeletedAccountsArchive';
import { ErrorLogPanel } from '@/components/admin/ErrorLogPanel';
import { ScrapingUsageReport } from '@/components/admin/ScrapingUsageReport';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SuperAdmin = () => {
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const section = resolveAdminSection(searchParams.get('section'));
  const [health, setHealth] = useState<Record<'whatsapp' | 'ai', 'idle' | 'checking' | 'online' | 'degraded'>>({ whatsapp: 'idle', ai: 'idle' });

  // Platform-wide totals come from a super-admin RPC: direct table reads are
  // strictly scoped to the active workspace, so they would under-count.
  const { data: stats } = useQuery({
    queryKey: ['admin-system-stats'],
    enabled: isSuperAdmin,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('get_platform_stats');
      const row = (data ?? {}) as Record<string, number>;
      return { voters: row.voters ?? 0, messages: row.messages ?? 0, campaigns: row.campaigns ?? 0, connections: row.connections ?? 0 };
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
      <p className="text-center text-sm text-muted-foreground">ניהול משתמשים, ייבוא מתווכים, כספים ובריאות המערכת.</p>

      {section === 'users' && (
        <div className="space-y-4">
          <BrokerUpgradeRequestsCard />
          <SuperAdminUsersTable />
        </div>
      )}

      {section === 'import' && (
        <div className="space-y-4">
          <BrokerBatchImportCard />
          <BrokerContactQueueCard />
        </div>
      )}

      {section === 'deletion' && (
        <div className="space-y-4">
          <SuperAdminDeleteUsersCard />
          <DeletedAccountsArchive />
        </div>
      )}

      {section === 'finance' && <FinanceTab />}

      {section === 'activity' && (
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> יומן פעולות מערכת</CardTitle><CardDescription>50 הפעולות האחרונות במערכת</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>זמן</TableHead><TableHead>משתמש</TableHead><TableHead>פעולה</TableHead><TableHead>יעד</TableHead></TableRow></TableHeader><TableBody>{(audit ?? []).map((a: any) => <TableRow key={a.id}><TableCell className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'dd/MM HH:mm')}</TableCell><TableCell className="font-mono text-xs">{a.actor_email || a.actor_id?.slice(0, 8)}</TableCell><TableCell><Badge variant="outline">{a.action}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{a.target_table ? `${a.target_table}/${(a.target_id || '').slice(0, 8)}` : '-'}</TableCell></TableRow>)}{(!audit || audit.length === 0) && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">אין רשומות</TableCell></TableRow>}</TableBody></Table></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" /> ניטור אינטראקציות</CardTitle><CardDescription>היסטוריית אינטראקציות מכל הערוצים</CardDescription></CardHeader>
            <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto">{(globalActivity ?? []).map((row: any) => <div key={row.id} className="rounded-md border border-border/60 bg-background p-3"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={row.actor_type === 'ai_agent' ? 'secondary' : 'default'}>{row.actor_type === 'ai_agent' ? 'סוכן AI' : 'נציג'}</Badge><Badge variant="outline">{row.platform}</Badge><span className="text-xs text-muted-foreground">{format(new Date(row.created_at), 'dd/MM HH:mm')}</span>{row.live_post_url && <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={row.live_post_url} target="_blank" rel="noopener noreferrer" aria-label="צפייה בקמפיין החי" title="צפייה בקמפיין החי"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}</div><p className="whitespace-pre-wrap text-sm">{row.content}</p></div>)}{(!globalActivity || globalActivity.length === 0) && <p className="py-8 text-center text-sm text-muted-foreground">אין עדיין פעילות</p>}</CardContent>
          </Card>
        </div>
      )}

      {section === 'scraping' && <ScrapingUsageReport />}

      {section === 'connections' && (
        <div className="space-y-4">
          <GoLoginTokenCard />
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
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="סימון כטופל" title="סימון כטופל" onClick={() => resolveHealthAlert.mutate(alert.id)} disabled={resolveHealthAlert.isPending}><CheckCircle2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'system' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><StatCard label="סה״כ לידים" value={stats?.voters ?? 0} /><StatCard label="הודעות" value={stats?.messages ?? 0} /><StatCard label="קמפיינים" value={stats?.campaigns ?? 0} /><StatCard label="חיבורים פעילים" value={stats?.connections ?? 0} /></div>
          <Card><CardHeader><CardTitle className="text-base">סטטוס מערכת</CardTitle><CardDescription>בדיקת זמינות של WhatsApp ומנועי ה־AI</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><HealthToggle label="שער WhatsApp" status={health.whatsapp} onChange={(v) => checkHealth('whatsapp', v)} /><HealthToggle label="מנועי AI" status={health.ai} onChange={(v) => checkHealth('ai', v)} /></CardContent></Card>
          <ErrorLogPanel />
        </div>
      )}
    </div>
  );
};


function StatCard({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-primary">{value.toLocaleString()}</p></CardContent></Card>;
}

function HealthToggle({ label, status, onChange }: { label: string; status: 'idle' | 'checking' | 'online' | 'degraded'; onChange: (v: boolean) => void }) {
  const text = status === 'checking' ? 'בודק' : status === 'online' ? 'תקין' : status === 'degraded' ? 'דורש בדיקה' : 'כבוי';
  return <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-4"><div><p className="font-bold">{label}</p><Badge variant={status === 'online' ? 'default' : status === 'degraded' ? 'destructive' : 'secondary'}>{text}</Badge></div><Switch checked={status === 'online' || status === 'checking'} onCheckedChange={onChange} /></div>;
}

export default SuperAdmin;
