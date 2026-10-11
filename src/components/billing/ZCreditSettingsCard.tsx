import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type Cfg = { configured: boolean; terminal_id: string; api_key_last4: string | null; environment: 'sandbox' | 'production' };

export function ZCreditSettingsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['zcredit-config'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('zcredit-config', { method: 'GET' });
      if (error) throw error;
      return data as Cfg;
    },
  });
  const [terminal, setTerminal] = useState('');
  const [key, setKey] = useState('');
  const [prod, setProd] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setTerminal(data.terminal_id); setProd(data.environment === 'production'); } }, [data]);

  const save = async () => {
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke('zcredit-config', {
      body: { terminal_id: terminal, api_key: key || undefined, environment: prod ? 'production' : 'sandbox' },
    });
    setBusy(false);
    if (error || (res as any)?.error) { toast.error((res as any)?.error ?? 'השמירה נכשלה'); return; }
    setKey('');
    toast.success('הגדרות Z-Credit נשמרו');
    qc.invalidateQueries({ queryKey: ['zcredit-config'] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Z-Credit סליקה</CardTitle>
              <CardDescription className="text-xs">שמירת כרטיסים וחיוב אוטומטי של הארנק</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{data?.configured ? (data.environment === 'production' ? 'פעיל' : 'בדיקות') : 'לא מוגדר'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="zc-term">מספר מסוף (Terminal ID)</Label>
          <Input id="zc-term" dir="ltr" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="zc-key">מפתח API / סיסמה</Label>
          <Input id="zc-key" dir="ltr" type="password" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={data?.api_key_last4 ? `שמור •••• ${data.api_key_last4}` : ''} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="zc-env">{prod ? 'סביבת ייצור (חיובים אמיתיים)' : 'סביבת בדיקות'}</Label>
          <Switch id="zc-env" checked={prod} onCheckedChange={setProd} />
        </div>
        <Button onClick={save} disabled={busy || !terminal}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
      </CardContent>
    </Card>
  );
}
