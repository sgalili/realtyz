import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Cloud, ShieldCheck, Trash2 } from 'lucide-react';
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
      await call('save', { cookies: cookies.trim(), user_agent: navigator.userAgent });
      setCookies('');
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

  const active = session?.status === 'active';
  const expires = session?.expires_at ? new Date(session.expires_at).toLocaleDateString('he-IL') : null;

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className={`h-4 w-4 ${active ? 'text-emerald-600' : 'text-muted-foreground'}`} />
          פרסום מהענן (גם כשהמחשב כבוי)
        </CardTitle>
        <Badge
          className={active ? '!bg-emerald-600 !text-white' : ''}
          variant={active ? 'default' : 'secondary'}
        >
          {loading ? 'טוען…' : active ? 'מחובר' : 'לא מחובר'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          שמירת חיבור הפייסבוק שלך בצורה מוצפנת מאפשרת לשרת לפרסם בקבוצות בזמנים שקבעת,
          גם בלי דפדפן פתוח. הנתונים מוצפנים ואינם מוצגים שוב אחרי השמירה.
        </p>

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
