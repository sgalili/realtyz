import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { inspectRitaVoiceInfrastructure } from '@/lib/ritaVoice.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, Loader2, PlugZap, Save } from 'lucide-react';
import { VoiceAgentPanel } from '@/components/calendar/VoiceAgentPanel';
import { RITA_DEFAULT_VOICE_ID } from '../../../supabase/functions/_shared/ivrVoices';

type Provider = 'Twilio';
const FIELDS: Record<Provider, { label: string; secret?: boolean }[]> = {
  Twilio: [{ label: 'Account SID' }, { label: 'Auth Token', secret: true }, { label: 'מספר טלפון' }],
};

function IconBtn({ label, onClick, busy, children }: { label: string; onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClick} disabled={busy} aria-label={label} title={label}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  );
}

/** Super Admin home for Twilio and ElevenLabs. Storage stays in api_configs via manage-api-configs. */
export function VoiceProvidersTab() {
  const [values, setValues] = useState<Record<Provider, string[]>>({ Twilio: ['', '', ''] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Provider | null>(null);
  const [testing, setTesting] = useState(false);
  const inspectVoice = useServerFn(inspectRitaVoiceInfrastructure);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        if (error) throw error;
        const rows = (data as { service_name: string; api_key?: string }[]) || [];
        const next = { Twilio: ['', '', ''] } as Record<Provider, string[]>;
        for (const p of ['Twilio'] as Provider[]) {
          const r = rows.find((x) => x.service_name === p);
          if (r?.api_key) { const parts = String(r.api_key).split(':'); next[p] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']; }
        }
        if (alive) setValues(next);
      } catch { /* empty state */ } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const save = async (p: Provider) => {
    const v = values[p].map((x) => x.trim());
    if (!v[0] || (p === 'Twilio' && !v[1])) { toast.error('חסרים פרטי חיבור'); return; }
    setSaving(p);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', { method: 'POST', body: { service_name: p, api_key: v.join(':'), is_active: true } });
      if (error) throw error;
      toast.success(`${p} נשמר`);
    } catch (e) { toast.error(`השמירה נכשלה: ${(e as Error)?.message ?? e}`); } finally { setSaving(null); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await inspectVoice();
      (result.connected ? toast.success : toast.error)(result.message);
    } catch { toast.error('בדיקת החיבור נכשלה'); } finally { setTesting(false); }
  };

  const block = (p: Provider) => (
    <Card key={p}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-sm font-semibold">{p}</CardTitle>
        <div className="flex items-center gap-1">
          {<IconBtn label="בדיקת חיבור" onClick={test} busy={testing || loading}><PlugZap className="h-4 w-4" /></IconBtn>}
          <IconBtn label="שמירה" onClick={() => save(p)} busy={saving === p || loading}><Save className="h-4 w-4" /></IconBtn>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-4 sm:grid-cols-3">
        {FIELDS[p].map((f, i) => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            <Input dir="ltr" type={f.secret ? 'password' : 'text'} value={values[p][i] ?? ''} disabled={loading}
              onChange={(e) => setValues((s) => ({ ...s, [p]: s[p].map((x, j) => (j === i ? e.target.value : x)) }))} />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4" dir="rtl">
      {block('Twilio')}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="text-sm font-semibold">ElevenLabs</CardTitle>
          <IconBtn label="העתקת מזהה הקול" onClick={() => { void navigator.clipboard.writeText(RITA_DEFAULT_VOICE_ID); toast.success('הועתק'); }}><Copy className="h-4 w-4" /></IconBtn>
        </CardHeader>
        <CardContent className="pb-4">
          <Label className="text-xs text-muted-foreground">קול ברירת מחדל · ריטה</Label>
          <p dir="ltr" className="mt-1 font-mono text-sm text-end">{RITA_DEFAULT_VOICE_ID}</p>
        </CardContent>
      </Card>
      <VoiceAgentPanel />
    </div>
  );
}
