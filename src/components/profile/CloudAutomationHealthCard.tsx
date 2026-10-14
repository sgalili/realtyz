import { useQuery } from '@tanstack/react-query';
import { Activity, Cloud, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';

type Health = {
  checked_at: string;
  worker: { url: string | null; reachable: boolean; configured: boolean; last_heartbeat: string | null };
  scheduler: { last_tick: string | null };
  queue: { pending: number; processing: number; failed_today: number; sent_today: number; overdue: number; expired_leases: number };
};

export function CloudAutomationHealthCard() {
  const { isSuperAdmin, loading, error } = useUserRole();
  if (loading || error || !isSuperAdmin) return null;
  return <CloudAutomationHealthContent />;
}

function CloudAutomationHealthContent() {
  const owner = useActiveWorkspaceOwnerId();
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['cloud-automation-health', owner],
    enabled: !!owner,
    queryFn: async (): Promise<Health> => {
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'monitor' } });
      if (error || data?.error) throw new Error('לא ניתן לקרוא את מצב אוטומציית הענן');
      return data;
    },
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const fresh = (value: string | null | undefined) => !!value && Date.now() - Date.parse(value) < 15 * 60_000;
  const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString('he-IL') : 'לא התקבל';
  const queueIssue = !!data && (data.queue.overdue > 0 || data.queue.expired_leases > 0 || data.queue.failed_today > 0);
  return (
    <Card dir="rtl" id="cloud-automation" className="border-destructive/40">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Cloud className="h-5 w-5 text-primary" />אוטומציית ענן 24/7</CardTitle>
        <Button variant="ghost" size="icon" aria-label="רענון מצב אוטומציית הענן" title="רענון מצב" disabled={isFetching || !owner} onClick={() => void refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm" aria-live="polite">
        {isError ? <p className="text-destructive">לא ניתן לקרוא את המצב. נסו לרענן.</p> : isPending ? <p className="text-muted-foreground">טוען מצב ענן…</p> : data && <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">שרת Railway</span>
            <Badge variant="secondary" className={data.worker.reachable ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>
              {data.worker.reachable ? 'השרת מגיב' : data.worker.configured ? 'השרת לא מגיב' : 'לא הוגדר'}
            </Badge>
          </div>
          {data.worker.url && <a href={data.worker.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block break-all text-xs text-primary underline">{data.worker.url}</a>}
          <div className="space-y-2 border-y py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1"><Activity className="h-4 w-4" />סימן חיים מהשרת</span><span className={fresh(data.worker.last_heartbeat) ? 'text-success' : 'text-warning'}>{timestamp(data.worker.last_heartbeat)}</span></div>
            <div className="flex flex-wrap justify-between gap-2"><span>ריצת מתזמן אחרונה</span><span className={fresh(data.scheduler.last_tick) ? 'text-success' : 'text-warning'}>{timestamp(data.scheduler.last_tick)}</span></div>
          </div>
          <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">תור סביבת העבודה</span><span className={queueIssue ? 'text-warning' : 'text-success'}>{queueIssue ? 'דורש בדיקה' : 'תקין'}</span></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[[data.queue.pending, 'ממתינים'], [data.queue.processing, 'בטיפול'], [data.queue.sent_today, 'נשלחו היום'], [data.queue.failed_today, 'נכשלו היום'], [data.queue.overdue, 'ממתינים מעל 15 דקות'], [data.queue.expired_leases, 'משימות עם נעילה שפגה']].map(([value, label]) => <div key={label} className="flex min-w-0 justify-between gap-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
          </dl>
          <p className="text-xs text-muted-foreground">עודכן: {timestamp(data.checked_at)}</p>
        </>}
      </CardContent>
    </Card>
  );
}