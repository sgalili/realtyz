import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Phone, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface VoiceAgentRow {
  id: string;
  user_id: string;
  availability: 'available' | 'away';
  elevenlabs_agent_id: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_phone_number: string | null;
  greeting: string | null;
  language: string;
  last_synced_at: string | null;
}

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (חמה, נקבה)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda (רגועה, נקבה)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (בוגר, זכר)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (בטוח, זכר)' },
];

export function VoiceAgentPanel() {
  const [row, setRow] = useState<VoiceAgentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from('voice_agents').select('*').eq('user_id', user.id).maybeSingle();
    if (!data) {
      const { data: created } = await supabase.from('voice_agents').insert({ user_id: user.id }).select().single();
      setRow(created as VoiceAgentRow);
    } else {
      setRow(data as VoiceAgentRow);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = async (patch: Partial<VoiceAgentRow>) => {
    if (!row) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('voice_agents')
      .update(patch)
      .eq('id', row.id)
      .select()
      .single();
    setSaving(false);
    if (error) { toast({ title: 'שמירה נכשלה', description: error.message, variant: 'destructive' }); return; }
    setRow(data as VoiceAgentRow);
  };

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('elevenlabs-agent-sync', { body: {} });
    setSyncing(false);
    if (error || (data as { error?: string })?.error) {
      toast({
        title: 'הסנכרון נכשל',
        description: error?.message || (data as { error?: string })?.error,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'סוכן הקול AI סונכרן', description: 'אישיות התאום הווירטואלי שלך פעילה כעת בשיחות.' });
    load();
  };

  if (loading) return (
    <Card><CardContent className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 ml-2 animate-spin" />טוען…</CardContent></Card>
  );
  if (!row) return null;

  const synced = !!row.elevenlabs_agent_id;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              סוכן קול AI
            </CardTitle>
            <CardDescription>
              עונה לטלפון כשאינך זמין/ה, מתעד את פרטי הלקוח, מתמלל את השיחה ומעדכן את חדר העסקאות.
            </CardDescription>
          </div>
          {synced && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />מסונכרן</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-4 p-3 rounded-md border bg-muted/30">
          <div className="space-y-1">
            <Label htmlFor="availability" className="text-base">זמינות</Label>
            <p className="text-xs text-muted-foreground">
              {row.availability === 'available'
                ? 'אתה עונה לשיחות ראשון. ה-AI עונה רק אם פספסת.'
                : 'ה-AI עונה לכל השיחות הנכנסות מיד.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">לא זמין</span>
            <Switch
              id="availability"
              checked={row.availability === 'available'}
              onCheckedChange={(v) => update({ availability: v ? 'available' : 'away' })}
              disabled={saving}
            />
            <span className="text-xs text-muted-foreground">זמין</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>קול</Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={row.elevenlabs_voice_id || VOICES[0].id}
              onChange={(e) => update({ elevenlabs_voice_id: e.target.value })}
            >
              {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>שפה</Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={row.language}
              onChange={(e) => update({ language: e.target.value })}
            >
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>מספר טלפון</Label>
          <Input
            placeholder="לדוגמה: +972-50-123-4567"
            value={row.elevenlabs_phone_number || ''}
            onChange={(e) => setRow({ ...row, elevenlabs_phone_number: e.target.value })}
            onBlur={(e) => update({ elevenlabs_phone_number: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            רכשו מספר ב-ElevenLabs Conversational AI והדביקו אותו כאן לניתוב שיחות נכנסות.
          </p>
        </div>

        <div className="space-y-2">
          <Label>ברכת פתיחה</Label>
          <Textarea
            rows={3}
            placeholder="השאירו ריק כדי להשתמש בברכת ברירת המחדל."
            value={row.greeting || ''}
            onChange={(e) => setRow({ ...row, greeting: e.target.value })}
            onBlur={(e) => update({ greeting: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {row.last_synced_at
              ? `סונכרן לאחרונה ${new Date(row.last_synced_at).toLocaleString('he-IL')}`
              : 'סנכרנו כדי להעביר את אישיות התאום הווירטואלי, הקול והברכה ל-ElevenLabs.'}
          </p>
          <Button onClick={sync} disabled={syncing}>
            {syncing ? <><Loader2 className="h-4 w-4 ml-2 animate-spin" />מסנכרן…</>
                     : <><RefreshCw className="h-4 w-4 ml-2" />{synced ? 'סנכרון מחדש' : 'הפעלת סוכן הקול'}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
