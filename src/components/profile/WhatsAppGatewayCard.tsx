import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Loader2, CheckCircle2, ImageDown } from 'lucide-react';

/**
 * Quick-update card for Green API WhatsApp gateway credentials.
 * Lives on /profile so the account owner can rotate the WA Instance
 * without diving into the full Settings → API page.
 *
 * On save (or successful test) we ALSO upsert a `social_connections`
 * row for `whatsapp_green` with `is_connected = true` so every
 * WA-aware surface across the app (inbox composer, deal-room reply,
 * campaign center, SMS/blast simulator, dashboard channel pills,
 * SocialConnectionsTab) immediately treats this account as a live
 * WhatsApp gateway instead of showing the controls as disabled.
 */
export function WhatsAppGatewayCard() {
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [waPhone, setWaPhone] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'ok' | 'err'>('unknown');
  const [syncingAvatars, setSyncingAvatars] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        if (error) throw error;
        const row = (data as any[])?.find((r) => r.service_name === 'Green API');
        if (row?.api_key) {
          const parts = String(row.api_key).split(':');
          setInstanceId(parts[0] ?? '');
          setToken(parts.slice(1).join(':'));
        }
      } catch {
        /* silent — user will just enter fresh values */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Probe phone once creds are populated.
  useEffect(() => {
    if (!loading && instanceId && token && !waPhone) {
      probePhone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, instanceId, token]);

  const upsertSocialConnection = async (waState: 'authorized' | 'unknown') => {
    try {
      await supabase
        .from('social_connections')
        .upsert(
          {
            platform: 'whatsapp_green',
            display_name: `WhatsApp · Instance ${instanceId.trim()}`,
            is_connected: waState === 'authorized',
            credentials: {
              manual: {
                instance_id: instanceId.trim(),
                api_token: token.trim(),
                token: token.trim(),
                wa_state: waState,
              },
              wa_state: waState,
              instance_id: instanceId.trim(),
              token: token.trim(),
              api_token: token.trim(),
            },
            connected_at: waState === 'authorized' ? new Date().toISOString() : null,
            last_test_at: new Date().toISOString(),
            last_test_status: waState === 'authorized' ? 'ok' : 'unknown',
          } as any,
          { onConflict: 'platform' },
        );
    } catch {
      /* non-fatal: send-whatsapp's api_configs fallback still works */
    }
  };

  const probePhone = async (): Promise<void> => {
    try {
      const res = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/getWaSettings/${token.trim()}`,
      );
      const data = await res.json().catch(() => ({}));
      const wid: string = data?.wid ?? data?.phone ?? '';
      const digits = String(wid).replace(/\D/g, '');
      if (digits) setWaPhone(digits);
    } catch { /* ignore */ }
  };

  const probeState = async (): Promise<'authorized' | 'unknown'> => {
    try {
      const res = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/getStateInstance/${token.trim()}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.stateInstance === 'authorized') {
        probePhone();
        return 'authorized';
      }
    } catch { /* ignore */ }
    return 'unknown';
  };

  const save = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא Instance ID ו-API Token');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: {
          service_name: 'Green API',
          api_key: `${instanceId.trim()}:${token.trim()}`,
          is_active: true,
        },
      });
      if (error) throw error;
      const state = await probeState();
      await upsertSocialConnection(state);
      if (state === 'authorized') setStatus('ok');
      toast.success(
        state === 'authorized'
          ? 'פרטי WhatsApp נשמרו והחיבור הופעל בכל הרכיבים במערכת'
          : 'פרטי WhatsApp נשמרו (המתן לאישור המכשיר ולאחר מכן לחץ בדיקת חיבור)',
      );
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא קודם Instance ID ו-API Token');
      return;
    }
    setTesting(true);
    setStatus('unknown');
    try {
      const state = await probeState();
      if (state === 'authorized') {
        setStatus('ok');
        await upsertSocialConnection('authorized');
        toast.success('✅ חיבור Green API תקין · WhatsApp פעיל בכל הרכיבים');
      } else {
        setStatus('err');
        await upsertSocialConnection('unknown');
        toast.error('חיבור Green API לא מאומת. סרוק את ה-QR בלוח הבקרה של Green API ונסה שוב.');
      }
    } catch (e: any) {
      setStatus('err');
      toast.error(`בדיקה נכשלה: ${e?.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  const syncAvatars = async (force = false) => {
    setSyncingAvatars(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', {
        body: { force, limit: 500 },
      });
      if (error) throw error;
      const r = data as { scanned: number; updated: number; skipped: number; failed: number };
      toast.success(
        `סונכרנו תמונות פרופיל מ-WhatsApp · עודכנו ${r.updated} מתוך ${r.scanned}` +
          (r.failed > 0 ? ` · ${r.failed} כשלונות` : ''),
      );
    } catch (e: any) {
      toast.error(`סנכרון תמונות נכשל: ${e?.message ?? e}`);
    } finally {
      setSyncingAvatars(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right flex items-center gap-2 justify-end">
          {status === 'ok' && (
            <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> פעיל
            </Badge>
          )}
          <span>חיבור WhatsApp (Green API)</span>
          <MessageCircle className="h-5 w-5 text-emerald-600" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground text-right">
          {"\n"}
        </p>

        <div className="space-y-1.5">
          <Label className="text-right block">מספר WhatsApp מחובר</Label>
          <Input
            dir="ltr"
            readOnly
            placeholder={waPhone ? '' : 'יוצג לאחר בדיקת חיבור'}
            value={waPhone ? `+${waPhone}` : ''}
            className="bg-muted/40"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wa-instance" className="text-right block">Instance ID</Label>
          <Input
            id="wa-instance"
            dir="ltr"
            placeholder="7103164675"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wa-token" className="text-right block">API Token</Label>
          <Input
            id="wa-token"
            dir="ltr"
            type="password"
            placeholder="••••••••••••••••"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-1.5 justify-end pt-1 flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAvatars(false)}
            disabled={syncingAvatars || loading}
            title="משוך תמונות פרופיל מ-WhatsApp לכל המתעניינים החסרים תמונה"
            className="px-2 text-xs whitespace-nowrap"
          >
            {syncingAvatars ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageDown className="ml-1 h-3.5 w-3.5" />
            )}
            סנכרון תמונות
          </Button>
          <Button variant="outline" size="sm" onClick={test} disabled={testing || loading}
            className="px-2 text-xs whitespace-nowrap">
            {testing ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
            בדיקת חיבור
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading}
            className="px-2 text-xs whitespace-nowrap">
            {saving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
            שמירה
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default WhatsAppGatewayCard;
