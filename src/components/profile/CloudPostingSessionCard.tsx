import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Cloud, ShieldCheck, Trash2, ExternalLink, Loader2 } from 'lucide-react';
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
 * so scheduled group posts run even when the laptop is off.
 */
export function CloudPostingSessionCard() {
  const [session, setSession] = useState<CloudSession>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cookies, setCookies] = useState('');
  const [summary, setSummary] = useState<{ sent_today: number; pending: number; failed_today: number; active_pool: number; pool_cap: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const [workerReady, setWorkerReady] = useState(true);

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
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const save = async () => {
    if (cookies.trim().length < 20) {
      toast.error('הדביקו את נתוני ההתחברות המלאים');
      return;
    }
    setSaving(true);
    try {
      const res = await call('save', { cookies: cookies.trim(), user_agent: navigator.userAgent });
      setCookies('');
      if (res?.session) setSession(res.session); // badge flips to פעיל בענן immediately
      toast.success('החיבור נשמר מוצפן – פרסום בענן פעיל');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'שמירת החיבור נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await call('clear');
      toast.success('החיבור לענן נמחק');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'המחיקה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const openRemote = async () => {
    const win = window.open('about:blank', '_blank', 'noopener,noreferrer');
    setOpening(true);
    try {
      const data = await call('remote_login');
      if (win) win.location.href = data.url; else window.open(data.url, '_blank', 'noopener,noreferrer');
      toast.success('דפדפן הענן נפתח – התחברו לפייסבוק בחלון החדש');
      await refresh();
    } catch (e) {
      win?.close();
      toast.error((e as Error).message || 'פתיחת הדפדפן נכשלה');
    } finally { setOpening(false); }
  };

  const expiredAt = session?.expires_at ? new Date(session.expires_at).getTime() < Date.now() : false;
  const state: 'active' | 'connecting' | 'reauth' =
    session?.status === 'active' && !expiredAt && !session?.last_error ? 'active'
    : session?.status === 'connecting' ? 'connecting' : 'reauth';
  const STATE = {
    active: { label: 'פעיל בענן', cls: 'bg-success text-success-foreground' },
    connecting: { label: 'מתחבר', cls: 'bg-warning text-warning-foreground' },
    reauth: { label: 'נדרש חידוש התחברות לפייסבוק', cls: 'bg-destructive text-destructive-foreground' },
  }[state];
  const active = session?.status === 'active';
  const expires = session?.expires_at ? new Date(session.expires_at).toLocaleDateString('he-IL') : null;

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className={`h-4 w-4 ${state === 'active' ? 'text-success' : 'text-muted-foreground'}`} />
          אוטומציית ענן (24/7)
        </CardTitle>
        <Badge className={loading ? '' : STATE.cls} variant="secondary">
          {loading ? 'טוען…' : STATE.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          שמירת חיבור הפייסבוק שלך בצורה מוצפנת מאפשרת לשרת לפרסם בקבוצות בזמנים שקבעת,
          גם בלי דפדפן פתוח. הנתונים מוצפנים ואינם מוצגים שוב אחרי השמירה.
        </p>

        {state === 'active' && !workerReady && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            החיבור נשמר. הפוסטים ימתינו בתור עד שהשרת שמבצע את הפרסום בענן יופעל.
          </p>
        )}

        {summary && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.sent_today}</div><div className="text-xs text-muted-foreground">נשלחו היום מהענן</div></div>
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.pending}</div><div className="text-xs text-muted-foreground">ממתינים בתור</div></div>
            <div className="rounded-md border p-2"><div className="text-lg font-bold">{summary.active_pool}/{summary.pool_cap}</div><div className="text-xs text-muted-foreground">קבוצות פעילות</div></div>
          </div>
        )}

        <Button size="sm" className="w-full" onClick={openRemote} disabled={opening}>
          {opening ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <ExternalLink className="me-1 h-4 w-4" />}
          חיבור ראשוני לפייסבוק בענן
        </Button>

        {active && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> החיבור מאובטח ומוצפן
            </div>
            {expires && <div className="mt-1">בתוקף עד {expires}</div>}
            {session?.last_error && <div className="mt-1 text-destructive">{session.last_error}</div>}
          </div>
        )}

        <Textarea
          dir="ltr"
          rows={4}
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
          placeholder='הדבק כאן את נתוני ההתחברות (Cookies) מדפדפן מחובר לפייסבוק'
        />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {active ? 'רענון חיבור' : 'שמירת חיבור מוצפן'}
          </Button>
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
