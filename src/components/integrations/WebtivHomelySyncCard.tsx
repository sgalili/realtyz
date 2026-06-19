import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

const DEFAULT_BUYERS = 'b6bb7f44-571b-4551-8de9-e075b8a89128';
const DEFAULT_SELLERS = '32dc79a4-88ba-49a4-816e-f1fc43024c2f';

type State = {
  buyers_guid: string | null;
  sellers_guid: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_summary: any;
  last_error: string | null;
};

export function WebtivHomelySyncCard() {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [buyers, setBuyers] = useState(DEFAULT_BUYERS);
  const [sellers, setSellers] = useState(DEFAULT_SELLERS);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('webtiv_sync_state' as any)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setState(d);
      setBuyers(d.buyers_guid || DEFAULT_BUYERS);
      setSellers(d.sellers_guid || DEFAULT_SELLERS);
      setEnabled(Boolean(d.enabled));
    } else {
      setState(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      buyers_guid: buyers.trim() || null,
      sellers_guid: sellers.trim() || null,
      enabled,
    };
    const { error } = await supabase
      .from('webtiv_sync_state' as any)
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error('שגיאה בשמירה: ' + error.message);
    else { toast.success('הגדרות הסנכרון נשמרו'); load(); }
  };

  const handleSyncNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('webtiv-homely-sync', {
        body: { buyers_guid: buyers.trim(), sellers_guid: sellers.trim() },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (r) {
        const total = (r.buyers?.inserted || 0) + (r.sellers?.inserted || 0);
        const dups = (r.buyers?.duplicates || 0) + (r.sellers?.duplicates || 0);
        toast.success(`סנכרון הסתיים: ${total} חדשים, ${dups} כפילויות`);
      } else {
        toast.success('סנכרון בוצע');
      }
      await load();
    } catch (e: any) {
      toast.error('סנכרון נכשל: ' + (e?.message || 'unknown'));
    } finally {
      setRunning(false);
    }
  };

  const statusBadge = () => {
    const s = state?.last_status;
    if (s === 'ok') return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">סנכרון Webtiv ── Homely פעיל</Badge>;
    if (s === 'partial') return <Badge className="bg-amber-500/15 text-amber-800 border-amber-500/30">סנכרון חלקי</Badge>;
    if (s === 'failed') return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">סנכרון נכשל</Badge>;
    return <Badge variant="outline">טרם הופעל</Badge>;
  };

  return (
    <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">סנכרון Webtiv ⇄ Homely (אוטומטי)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            משיכת לידים חיים מערוצי קונים ומוכרים של Webtiv ישירות לכרטיסי Open Card בחשבון Homely שלך, עם דה־דופליקציה לפי טלפון/אימייל.
          </p>
        </div>
        {statusBadge()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">GUID ערוץ קונים</Label>
          <Input dir="ltr" value={buyers} onChange={(e) => setBuyers(e.target.value)} placeholder={DEFAULT_BUYERS} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">GUID ערוץ מוכרים</Label>
          <Input dir="ltr" value={sellers} onChange={(e) => setSellers(e.target.value)} placeholder={DEFAULT_SELLERS} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="webtiv-enabled" />
          <Label htmlFor="webtiv-enabled" className="text-xs">סנכרון אוטומטי ברקע (כל 15 דקות)</Label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר…' : 'שמור הגדרות'}
          </Button>
          <Button size="sm" onClick={handleSyncNow} disabled={running || loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${running ? 'animate-spin' : ''}`} />
            {running ? 'מסנכרן…' : 'סנכרן כעת'}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2">
        <span>
          {state?.last_run_at
            ? <>סנכרון אחרון: <span className="font-semibold text-foreground">{new Date(state.last_run_at).toLocaleString('he-IL')}</span></>
            : 'טרם הופעל סנכרון'}
        </span>
        {state?.last_summary && (
          <span>
            קונים: {state.last_summary?.buyers?.inserted || 0} חדשים / {state.last_summary?.buyers?.duplicates || 0} כפילויות
            {' · '}
            מוכרים: {state.last_summary?.sellers?.inserted || 0} חדשים / {state.last_summary?.sellers?.duplicates || 0} כפילויות
          </span>
        )}
      </div>
      {state?.last_error && (
        <p className="text-[10px] text-red-600 dir-ltr break-all">{state.last_error}</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        לכל ליד מסונכרן נשמר קישור עומק ל־Webtiv OpenCard לפי מספר הסידור — נגיש מתוך כרטיס הליד בלוח המרכזי.
      </p>
    </div>
  );
}
