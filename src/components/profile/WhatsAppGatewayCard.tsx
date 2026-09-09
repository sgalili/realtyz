import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Loader2, CheckCircle2, ImageDown, QrCode, PlusCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { useWaAvatarSync } from '@/hooks/useWaAvatarSync';

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
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrNote, setQrNote] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const avatarSync = useWaAvatarSync();

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

  // Background sweep: keeps running on the server even if the user navigates
  // away mid-sync, and the hook re-attaches to the live job on return.
  const syncAvatars = async (force = false) => {
    setSyncingAvatars(true);
    try {
      const res = await avatarSync.start(force);
      if (res.supported === false) return; // silent circuit-breaker
      toast.success('סנכרון תמונות הפרופיל התחיל · ימשיך לרוץ גם אם תעבור למסך אחר');
    } finally {
      setSyncingAvatars(false);
    }
  };


  /** Pulls a live QR code from Green API (server-side) and polls until linked. */
  const openQr = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא Instance ID ו-API Token לפני סריקת QR');
      return;
    }
    setQrOpen(true);
    setQrImage(null);
    setQrNote('');
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'qr', instance_id: instanceId.trim(), token: token.trim() },
      });
      if (error) throw error;
      if ((data as any)?.status === 'connected') {
        setQrNote('המספר כבר מחובר. לחיבור מספר אחר יש להתנתק קודם.');
        setStatus('ok');
        if ((data as any)?.phone) setWaPhone(String((data as any).phone).replace(/\D/g, ''));
        await upsertSocialConnection('authorized');
      } else if ((data as any)?.qr_image) {
        setQrImage(String((data as any).qr_image));
      } else {
        setQrNote((data as any)?.error ?? 'לא ניתן להפיק קוד QR כרגע');
      }
    } catch (e: any) {
      setQrNote(e?.message ?? 'שגיאה בהפקת קוד QR');
    } finally {
      setQrLoading(false);
    }
  };

  // While the QR dialog is open, poll the live state so the card flips to
  // "פעיל" the moment the user finishes scanning.
  useEffect(() => {
    if (!qrOpen || !instanceId || !token) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('greenapi-session', {
          body: { action: 'status', instance_id: instanceId.trim(), token: token.trim() },
        });
        if ((data as any)?.status === 'connected') {
          setStatus('ok');
          if ((data as any)?.phone) setWaPhone(String((data as any).phone).replace(/\D/g, ''));
          await upsertSocialConnection('authorized');
          setQrOpen(false);
          toast.success('WhatsApp חובר בהצלחה');
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen, instanceId, token]);

  /** Creates a fresh Green API instance automatically (Partner API). */
  const createInstance = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'create_instance' },
      });
      if (error) throw error;
      const newId = (data as any)?.instance_id;
      const newToken = (data as any)?.token;
      if (!newId || !newToken) {
        toast.error((data as any)?.error ?? 'יצירת מכונה נכשלה');
        return;
      }
      setInstanceId(String(newId));
      setToken(String(newToken));
      setWaPhone('');
      setStatus('unknown');
      await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: { service_name: 'Green API', api_key: `${newId}:${newToken}`, is_active: true },
      });
      toast.success('מכונה חדשה נוצרה ונשמרה · כעת סרוק את קוד ה-QR');
      setTimeout(() => { void openQr(); }, 400);
    } catch (e: any) {
      toast.error(`יצירת מכונה נכשלה: ${e?.message ?? e}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle className="text-right flex items-center gap-2 justify-end">
          {status === 'ok' && (
            <Badge className="gap-1 rounded-full border-0 bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.75} /> פעיל
            </Badge>
          )}
          <span>מספר אישי בסריקת QR (Green API)</span>
          <MessageCircle className="h-5 w-5 text-emerald-600" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">


        <div className="space-y-1.5">
          <Label className="text-right block">מספר WhatsApp מחובר</Label>
          <Input
            dir="ltr"
            readOnly
            value={waPhone ? formatPhoneDisplay(waPhone) : ''}
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

        {avatarSync.active && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="tabular-nums">{avatarSync.percent}%</span>
              <span>
                מסנכרן תמונות פרופיל · {avatarSync.job?.scanned ?? 0}/{avatarSync.job?.total ?? 0}
                {' · עודכנו '}{avatarSync.job?.updated ?? 0}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${avatarSync.percent}%` }}
              />
            </div>
            <p className="text-[11px]">הסנכרון ממשיך ברקע גם אם תעבור למסך אחר.</p>
          </div>
        )}

        <div className="flex items-center gap-1.5 justify-end pt-1 flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAvatars(false)}
            disabled={syncingAvatars || avatarSync.active || loading}
            title="משוך תמונות פרופיל מ-WhatsApp לכל אנשי הקשר החסרים תמונה"
            className="px-2 text-xs whitespace-nowrap"
          >
            {syncingAvatars || avatarSync.active ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageDown className="ml-1 h-3.5 w-3.5" />
            )}
            סנכרון תמונות
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={createInstance}
            disabled={creating || loading}
            title="צור מכונת Green API חדשה אוטומטית"
            className="px-2 text-xs whitespace-nowrap"
          >
            {creating ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="ml-1 h-3.5 w-3.5" />}
            מכונה חדשה
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openQr}
            disabled={loading}
            className="px-2 text-xs whitespace-nowrap"
          >
            <QrCode className="ml-1 h-3.5 w-3.5" />
            סרוק קוד QR
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

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent dir="rtl" className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">סריקת קוד QR · WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrLoading && <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />}
            {!qrLoading && qrImage && (
              <img src={qrImage} alt="קוד QR לחיבור WhatsApp" className="h-56 w-56 rounded-md border" />
            )}
            {!qrLoading && qrNote && <p className="text-sm text-muted-foreground">{qrNote}</p>}
            <p className="text-xs text-muted-foreground">
              WhatsApp → הגדרות → מכשירים מקושרים → קישור מכשיר, ולאחר מכן סרוק את הקוד.
            </p>
            <Button variant="outline" size="sm" onClick={openQr} disabled={qrLoading}>
              רענן קוד
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default WhatsAppGatewayCard;
