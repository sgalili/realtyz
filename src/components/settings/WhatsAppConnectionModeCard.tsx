import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import {
  BadgeCheck, Building2, Loader2, QrCode, RefreshCw, Save, Smartphone, Wifi, WifiOff,
} from 'lucide-react';

type ConnectionType = 'official_meta' | 'qr_session';
type QrStatus = 'disconnected' | 'pending' | 'connected' | 'error';

interface Row {
  connection_type: ConnectionType;
  green_api_instance_id: string | null;
  green_api_token: string | null;
  qr_status: QrStatus;
  qr_phone: string | null;
}

const STATUS_META: Record<QrStatus, { label: string; className: string }> = {
  connected: { label: 'מחובר', className: 'text-emerald-700 border-emerald-300 bg-emerald-50' },
  pending: { label: 'ממתין לסריקה', className: 'text-amber-700 border-amber-300 bg-amber-50' },
  error: { label: 'שגיאת חיבור', className: 'text-red-700 border-red-300 bg-red-50' },
  disconnected: { label: 'לא מחובר', className: 'text-slate-600 border-slate-300 bg-slate-50' },
};

export function WhatsAppConnectionModeCard() {
  const ownerId = useActiveWorkspaceOwnerId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ConnectionType>('official_meta');
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<QrStatus>('disconnected');
  const [phone, setPhone] = useState<string>('');
  const [qrImage, setQrImage] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const { data } = await supabase
        .from('workspace_whatsapp_settings' as never)
        .select('*')
        .eq('workspace_owner_id', ownerId)
        .maybeSingle();
      const row = data as unknown as Row | null;
      if (row) {
        setMode(row.connection_type ?? 'official_meta');
        setInstanceId(row.green_api_instance_id ?? '');
        setToken(row.green_api_token ?? '');
        setStatus(row.qr_status ?? 'disconnected');
        setPhone(row.qr_phone ?? '');
      }
      setLoading(false);
    })();
  }, [ownerId]);

  const persist = async (patch: Partial<Row> & { last_checked_at?: string }) => {
    if (!ownerId) return;
    const { error } = await supabase
      .from('workspace_whatsapp_settings' as never)
      .upsert(
        {
          workspace_owner_id: ownerId,
          connection_type: mode,
          green_api_instance_id: instanceId.trim() || null,
          green_api_token: token.trim() || null,
          qr_status: status,
          qr_phone: phone || null,
          ...patch,
        } as never,
        { onConflict: 'workspace_owner_id' },
      );
    if (error) throw error;
  };

  const chooseMode = async (next: ConnectionType) => {
    setMode(next);
    setQrImage('');
    try {
      await persist({ connection_type: next });
      toast.success(
        next === 'official_meta'
          ? 'המערכת תשלח מהמספר הרשמי של הפלטפורמה'
          : 'נבחר חיבור מספר אישי באמצעות סריקת QR',
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    }
  };

  const saveCreds = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא Instance ID ו-API Token');
      return;
    }
    setSaving(true);
    try {
      await persist({ connection_type: 'qr_session' });
      toast.success('פרטי החיבור נשמרו');
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const checkStatus = async (silent = false) => {
    if (!instanceId.trim() || !token.trim()) {
      if (!silent) toast.error('יש למלא קודם Instance ID ו-API Token');
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/getStateInstance/${token.trim()}`,
      );
      const data = await res.json().catch(() => ({}));
      const authorized = res.ok && data?.stateInstance === 'authorized';
      const next: QrStatus = authorized ? 'connected' : res.ok ? 'pending' : 'error';
      setStatus(next);
      let nextPhone = phone;
      if (authorized) {
        setQrImage('');
        try {
          const s = await fetch(
            `https://api.green-api.com/waInstance${instanceId.trim()}/getWaSettings/${token.trim()}`,
          );
          const sd = await s.json().catch(() => ({}));
          const digits = String(sd?.wid ?? sd?.phone ?? '').replace(/\D/g, '');
          if (digits) {
            nextPhone = digits;
            setPhone(digits);
          }
        } catch { /* ignore */ }
      }
      await persist({
        connection_type: 'qr_session',
        qr_status: next,
        qr_phone: nextPhone || null,
        last_checked_at: new Date().toISOString(),
      });
      if (!silent) {
        if (authorized) toast.success('המספר האישי מחובר בהצלחה');
        else if (next === 'pending') toast.info('ההתקן טרם אושר. יש לסרוק את קוד ה-QR');
        else toast.error('בדיקת החיבור נכשלה');
      }
    } catch {
      setStatus('error');
      if (!silent) toast.error('בדיקת החיבור נכשלה');
    } finally {
      setChecking(false);
    }
  };

  const generateQr = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא קודם Instance ID ו-API Token');
      return;
    }
    setQrLoading(true);
    setQrImage('');
    try {
      const res = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/qr/${token.trim()}`,
      );
      const data = await res.json().catch(() => ({}));
      if (data?.type === 'qrCode' && data?.message) {
        setQrImage(`data:image/png;base64,${data.message}`);
        setStatus('pending');
        await persist({ connection_type: 'qr_session', qr_status: 'pending' });
      } else if (data?.type === 'alreadyLogged') {
        await checkStatus(true);
        toast.success('המספר כבר מחובר');
      } else {
        setStatus('error');
        toast.error('לא ניתן להפיק קוד QR. בדוק את פרטי החיבור');
      }
    } catch {
      setStatus('error');
      toast.error('לא ניתן להפיק קוד QR');
    } finally {
      setQrLoading(false);
    }
  };

  const statusMeta = STATUS_META[status];

  return (
    <Card className="border-blue-200" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-blue-600" />
          שיטת חיבור WhatsApp למרחב העבודה
        </CardTitle>
        <CardDescription>
          בחר מאיזה מספר תישלחנה ההודעות מהמערכת. ההגדרה חלה על כל חברי מרחב העבודה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseMode('official_meta')}
                className={`rounded-lg border p-4 text-right transition ${
                  mode === 'official_meta'
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-300'
                    : 'border-border hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">מספר רשמי של הפלטפורמה</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  שימוש בהגדרות המרכזיות (Meta WhatsApp Business). ללא הגדרה נוספת.
                </p>
                {mode === 'official_meta' && (
                  <Badge variant="outline" className="mt-3 gap-1 text-blue-700 border-blue-300">
                    <BadgeCheck className="h-3 w-3" /> נבחר
                  </Badge>
                )}
              </button>

              <button
                type="button"
                onClick={() => chooseMode('qr_session')}
                className={`rounded-lg border p-4 text-right transition ${
                  mode === 'qr_session'
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-300'
                    : 'border-border hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <QrCode className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">מספר אישי בסריקת QR</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  חיבור המספר הפרטי שלך על ידי סריקת קוד QR מתוך אפליקציית WhatsApp.
                </p>
                {mode === 'qr_session' && (
                  <Badge variant="outline" className="mt-3 gap-1 text-blue-700 border-blue-300">
                    <BadgeCheck className="h-3 w-3" /> נבחר
                  </Badge>
                )}
              </button>
            </div>

            {mode === 'qr_session' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={`gap-1 ${statusMeta.className}`}>
                    {status === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {statusMeta.label}
                  </Badge>
                  <span className="text-sm font-medium">מצב החיבור</span>
                </div>

                {phone && (
                  <div className="space-y-1.5">
                    <Label className="block text-right text-xs">מספר מחובר</Label>
                    <Input dir="ltr" readOnly value={`+${phone}`} className="bg-muted/40" />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="block text-right text-xs">Instance ID</Label>
                    <Input dir="ltr" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="block text-right text-xs">API Token</Label>
                    <Input dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => checkStatus()} disabled={checking}>
                    {checking ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-1 h-3.5 w-3.5" />}
                    בדיקת מצב
                  </Button>
                  <Button variant="outline" size="sm" onClick={generateQr} disabled={qrLoading}>
                    {qrLoading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <QrCode className="ml-1 h-3.5 w-3.5" />}
                    הפקת קוד QR
                  </Button>
                  <Button size="sm" onClick={saveCreds} disabled={saving}>
                    {saving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
                    שמירה
                  </Button>
                </div>

                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-background p-4">
                  {qrImage ? (
                    <>
                      <img src={qrImage} alt="קוד QR לחיבור WhatsApp" className="h-48 w-48" />
                      <p className="text-center text-xs text-muted-foreground leading-relaxed">
                        פתח WhatsApp בטלפון, היכנס להגדרות ולמכשירים מקושרים וסרוק את הקוד.
                        לאחר הסריקה לחץ על בדיקת מצב.
                      </p>
                    </>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      {status === 'connected'
                        ? 'המספר האישי מחובר. אין צורך בסריקה נוספת.'
                        : 'לחץ על הפקת קוד QR כדי לחבר את המספר האישי.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WhatsAppConnectionModeCard;
