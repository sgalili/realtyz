import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FacebookCloudConnectGate } from '@/components/social/FacebookCloudConnectGate';
import { GroupDiscoveryDialog } from '@/components/social/GroupDiscoveryDialog';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { FacebookGroupsIcon } from '@/components/icons/FacebookGroupsIcon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CloudSession = {
  status: string;
  last_verified_at: string | null;
  expires_at: string | null;
  user_agent: string | null;
  updated_at: string | null;
  last_error: string | null;
} | null;

/**
 * Manages the encrypted Facebook session used by the cloud publishing worker,
 * so group search, sync and posting run 24/7 on the server — with no local
 * browser extension. Workspace-scoped: any member with access to the active
 * workspace can view and manage the workspace's connection.
 */
export function CloudPostingSessionCard() {
  return <CloudPostingSessionContent />;
}

function CloudPostingSessionContent() {
  const [session, setSession] = useState<CloudSession>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const owner = useActiveWorkspaceOwnerId();
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [summary, setSummary] = useState<{ sent_today: number; pending: number; failed_today: number; active_pool: number; pool_cap: number } | null>(null);

  const [workerReady, setWorkerReady] = useState(true);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [runs, setRuns] = useState<{ ran_at: string; dispatched: number; deferred: number; failed: number }[]>([]);
  const tickFresh = !!lastTick && Date.now() - new Date(lastTick).getTime() < 15 * 60_000;
  useEffect(() => { const t = setInterval(() => { void call('runs').then((rr) => { setLastTick(rr?.last_tick ?? null); setRuns(rr?.runs ?? []); }).catch(() => {}); }, 60_000); return () => clearInterval(t); }, []);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('fb-session-vault', {
      body: { action, ...extra },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || data.error);
    return data;
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await call('status');
      setSession(data?.session ?? null);
      setWorkerReady(data?.worker_ready !== false);
      try { const sm = await call('summary'); setSummary(sm?.summary ?? null); } catch { setSummary(null); }
      try { const rr = await call('runs'); setLastTick(rr?.last_tick ?? null); setRuns(rr?.runs ?? []); } catch { /* ignore */ }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setSession(null); setSummary(null); void refresh(); }, [owner]);

  const clear = async () => {
    setSaving(true);
    try {
      await call('clear');
      toast.success('החיבור נמחק');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'המחיקה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const expiredAt = session?.expires_at ? new Date(session.expires_at).getTime() < Date.now() : false;
  const state: 'active' | 'connecting' | 'reauth' =
    session?.status === 'active' && !expiredAt && !session?.last_error ? 'active'
    : session?.status === 'connecting' ? 'connecting' : 'reauth';
  const STATE = {
    active: { label: 'פעיל', cls: 'bg-success text-success-foreground' },
    connecting: { label: 'מתחבר', cls: 'bg-warning text-warning-foreground' },
    reauth: { label: 'נדרש חידוש התחברות לפייסבוק', cls: 'bg-destructive text-destructive-foreground' },
  }[state];
  const active = session?.status === 'active';
  const expires = session?.expires_at ? new Date(session.expires_at).toLocaleDateString('he-IL') : null;

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FacebookGroupsIcon className="h-4 w-4" />
          אוטומציית פרסום (24/7)
        </CardTitle>
        <Badge className={loading ? '' : STATE.cls} variant="secondary">
          {loading ? 'טוען…' : STATE.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          שמירת חיבור הפייסבוק שלך בצורה מוצפנת מאפשרת לחפש קבוצות, לסנכרן ולפרסם
          בזמנים שקבעת — גם כשהמחשב סגור. הנתונים מוצפנים ואינם מוצגים
          שוב אחרי השמירה, ומשותפים לכל חברי סביבת העבודה.
        </p>

        {state === 'active' && !workerReady && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            החיבור נשמר. הקמפיינים ימתינו בתור עד שהפרסום יופעל.
          </p>
        )}

        {summary && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.sent_today}</div><div className="text-xs text-muted-foreground">נשלחו היום</div></div>
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.pending}</div><div className="text-xs text-muted-foreground">ממתינים בתור</div></div>
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.active_pool}/{summary.pool_cap}</div><div className="text-xs text-muted-foreground">קבוצות פעילות</div></div>
          </div>
        )}

        <div className="rounded-md border p-2 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">תהליך הרקע (כל 5 דקות)</span>
            <span className={tickFresh ? 'text-success' : 'text-destructive'}>
              {lastTick ? `ריצה אחרונה ${new Date(lastTick).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'לא נרשמה ריצה'}
            </span>
          </div>
          {runs.length === 0 ? (
            <div className="text-muted-foreground">אין עדיין קמפיינים שטופלו עבור סביבת העבודה</div>
          ) : runs.map((r, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{new Date(r.ran_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span>נשלחו {r.dispatched} · נדחו {r.deferred} · נכשלו {r.failed}</span>
            </div>
          ))}
        </div>

        <FacebookCloudConnectGate key={owner} alwaysVisible onSynced={() => void refresh()} onDiscover={() => setDiscoveryOpen(true)} />
        <GroupDiscoveryDialog key={`groups-${owner}`} open={discoveryOpen} onOpenChange={setDiscoveryOpen} onJoined={() => void refresh()} />

        {active && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> החיבור מאובטח ומוצפן
            </div>
            {expires && <div className="mt-1">בתוקף עד {expires}</div>}
            {session?.last_error && <div className="mt-1 text-destructive">{session.last_error}</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {active && (
            <Button size="sm" variant="outline" onClick={clear} disabled={saving}>
              <Trash2 className="me-1 h-4 w-4" /> מחיקת חיבור
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CloudPostingSessionCard;
