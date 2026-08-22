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
  const [polling, setPolling] = useState(false);

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

  /** Ask the backend (Green API bridge) for the live instance status. */
  const checkStatus = async (silent = false) => {
    if (!instanceId.trim() || !token.trim()) {
      if (!silent) toast.error('יש למלא קודם Instance ID ו-API Token');
      return 'disconnected' as QrStatus;
    }
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'status' },
      });
      if (error) throw error;
      const next = ((data as any)?.status ?? 'error') as QrStatus;
      setStatus(next);
      const nextPhone = String((data as any)?.phone ?? '');
      if (nextPhone) setPhone(nextPhone);
      if (next === 'connected') setQrImage('');
      if (!silent) {
        if (next === 'connected') toast.success('המספר האישי מחובר בהצלחה');
        else if (next === 'pending') toast.info('ההתקן טרם אושר. יש לסרוק את קוד ה-QR');
        else toast.error('בדיקת החיבור נכשלה');
      }
      return next;
    } catch (e: any) {
      setStatus('error');
      if (!silent) toast.error(e?.message ?? 'בדיקת החיבור נכשלה');
      return 'error' as QrStatus;
    } finally {
      setChecking(false);
    }
  };

  /** Request a fresh QR code and start polling until the phone links. */
  const generateQr = async (silent = false) => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא קודם Instance ID ו-API Token');
      return;
    }
    setQrLoading(true);
    try {
      // Make sure the credentials are stored before the backend reads them.
      await persist({ connection_type: 'qr_session' });
      const { data, error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'qr' },
      });
      if (error) throw error;
      const image = String((data as any)?.qr_image ?? '');
      const next = ((data as any)?.status ?? 'error') as QrStatus;
      setStatus(next);
      if (image) {
        setQrImage(image);
        setPolling(true);
      } else if (next === 'connected') {
        setQrImage('');
        setPolling(false);
        const p = String((data as any)?.phone ?? '');
        if (p) setPhone(p);
        if (!silent) toast.success('המספר כבר מחובר');
      } else if (!silent) {
        toast.error('לא ניתן להפיק קוד QR. בדוק את פרטי החיבור');
      }
    } catch (e: any) {
      setStatus('error');
      if (!silent) toast.error(e?.message ?? 'לא ניתן להפיק קוד QR');
    } finally {
      setQrLoading(false);
    }
  };

  /** Unlink the current number so a different one can be scanned. */
  const disconnect = async () => {
    setChecking(true);
    try {
      const { error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'logout' },
      });
      if (error) throw error;
      setStatus('disconnected');
      setPhone('');
      setQrImage('');
      setPolling(false);
      toast.success('המספר נותק');
    } catch (e: any) {
      toast.error(e?.message ?? 'הניתוק נכשל');
    } finally {
      setChecking(false);
    }
  };

  // Poll the connection status every 5s while a QR code is on screen, and
  // refresh the QR image itself every 20s (Green API codes expire quickly).
  useEffect(() => {
    if (!polling || mode !== 'qr_session') return;
    let ticks = 0;
    const id = setInterval(async () => {
      ticks += 1;
      const next = await checkStatus(true);
      if (next === 'connected') {
        setPolling(false);
        toast.success('המספר האישי מחובר בהצלחה');
        return;
      }
      if (ticks % 4 === 0) await generateQr(true);
      if (ticks >= 60) setPolling(false); // stop after ~5 minutes
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, mode, instanceId, token]);

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

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={`gap-1 ${statusMeta.className}`}>
                    {status === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {statusMeta.label}
                    {phone ? ` · ${phone}` : ''}
                  </Badge>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => checkStatus()} disabled={checking}>
                      {checking ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-1 h-3.5 w-3.5" />}
                      בדיקת מצב
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => generateQr()} disabled={qrLoading}>
                      {qrLoading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <QrCode className="ml-1 h-3.5 w-3.5" />}
                      הפקת קוד QR
                    </Button>
                    {status === 'connected' && (
                      <Button variant="outline" size="sm" onClick={disconnect} disabled={checking}>
                        <WifiOff className="ml-1 h-3.5 w-3.5" />
                        ניתוק
                      </Button>
                    )}
                    <Button size="sm" onClick={saveCreds} disabled={saving}>
                      {saving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
                      שמירה
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-background p-4">
                  {qrImage ? (
                    <>
                      <img src={qrImage} alt="קוד QR לחיבור WhatsApp" className="h-48 w-48" />
                      <p className="text-center text-xs text-muted-foreground leading-relaxed">
                        פתח WhatsApp בטלפון, היכנס להגדרות ולמכשירים מקושרים וסרוק את הקוד.
                      </p>
                      {polling && (
                        <span className="flex items-center gap-1 text-xs text-blue-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          ממתין לסריקה, המצב מתעדכן אוטומטית
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      {status === 'connected'
                        ? 'המספר האישי מחובר. הודעות אוטומטיות יישלחו מהמספר הזה.'
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
