import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Status = { configured?: boolean; source?: 'admin' | 'env' | null; last_check_status?: string | null; last_check_message?: string | null; last_checked_at?: string | null };

const LABEL: Record<string, string> = { valid: 'תקין', invalid_token: 'מפתח שגוי', plan_limit: 'מגבלת תוכנית', unreachable: 'לא זמין' };

/** Super Admin: save/replace the GoLogin API token. The saved value is never shown. */
export function GoLoginTokenCard() {
  const [status, setStatus] = useState<Status>({});
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('');

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('gologin-admin', { body });
    if (error) {
      const payload = await (error as { context?: Response }).context?.json().catch(() => null);
      throw new Error(payload?.message ?? 'הפעולה נכשלה');
    }
    return data;
  };
  const load = () => call({ action: 'status' }).then(setStatus).catch(() => {});
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy('save');
    try {
      const r = await call({ action: 'save', token });
      setToken('');
      r?.check?.ok ? toast.success('מפתח GoLogin נשמר ואומת') : toast.warning(r?.check?.message ?? 'המפתח נשמר');
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await call({ action: 'test' }); r?.check?.ok ? toast.success('המפתח תקין') : toast.error(r?.check?.message ?? 'הבדיקה נכשלה'); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(''); }
  };

  const check = status.last_check_status;
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> מפתח GoLogin</CardTitle>
      <CardDescription>המפתח משמש לפתיחת חלון החיבור המאובטח לפייסבוק. הערך השמור לא מוצג אף פעם.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>מצב:</span>
        <Badge variant={status.configured ? 'secondary' : 'destructive'}>{status.configured ? status.source === 'admin' ? 'נשמר בהגדרות' : 'מוגדר במערכת' : 'לא מוגדר'}</Badge>
        {check && <Badge variant={check === 'valid' ? 'secondary' : 'destructive'}>{LABEL[check] ?? check}</Badge>}
      </div>
      {status.last_check_message && check !== 'valid' && <p role="alert" className="text-sm text-destructive">{status.last_check_message}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="password" autoComplete="off" dir="ltr" placeholder="הדביקו מפתח API חדש מ-GoLogin" value={token} onChange={e => setToken(e.target.value)} />
        <Button onClick={() => void save()} disabled={!token.trim() || !!busy}>{busy === 'save' && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}שמירה</Button>
        <Button variant="outline" onClick={() => void test()} disabled={!status.configured || !!busy}>{busy === 'test' && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}בדיקה</Button>
      </div>
    </CardContent>
  </Card>;
}
