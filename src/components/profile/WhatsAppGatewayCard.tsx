import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, QrCode, Unlink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * Personal WhatsApp number for the active workspace, linked by scanning a QR
 * code. A workspace owns exactly ONE personal instance: the instance is created
 * automatically the first time the user asks for a QR code, so there are no
 * manual Instance ID / API Token fields and no "add instance" action.
 *
 * Profile-image syncing lives exclusively in the CRM page menu.
 */
export function WhatsAppGatewayCard() {
  const ownerId = useActiveWorkspaceOwnerId();
  const [loading, setLoading] = useState(true);
  const [instanceId, setInstanceId] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'connected' | 'pending' | 'disconnected' | 'error'>('disconnected');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrNote, setQrNote] = useState('');
  const [busy, setBusy] = useState(false);
  // The QR action only makes sense when the workspace chose the personal number.
  const [personalSelected, setPersonalSelected] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    const { data } = await supabase
      .from('workspace_whatsapp_settings' as never)
      .select('green_api_instance_id, qr_status, qr_phone, connection_type')
      .eq('workspace_owner_id', ownerId)
      .maybeSingle();
    const row = data as any;
    setInstanceId(String(row?.green_api_instance_id ?? ''));
    setPhone(String(row?.qr_phone ?? ''));
    setPersonalSelected(String(row?.connection_type ?? '') === 'qr_session');
    const st = String(row?.qr_status ?? 'disconnected');
    setStatus(st === 'connected' || st === 'pending' || st === 'error' ? (st as any) : 'disconnected');
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { void load(); }, [load]);

  // React instantly when the method selector above switches the workspace mode.
  useEffect(() => {
    const onMode = (e: Event) => {
      const value = (e as CustomEvent).detail;
      setPersonalSelected(value === 'qr_session');
    };
    window.addEventListener('realtyz:wa-mode-changed', onMode);
    return () => window.removeEventListener('realtyz:wa-mode-changed', onMode);
  }, []);

  /** Opens the QR dialog, provisioning the workspace instance when missing. */
  const openQr = async () => {
    setQrOpen(true);
    setQrImage(null);
    setQrNote('');
    setQrLoading(true);
    try {
      if (!instanceId) {
        const { data, error } = await supabase.functions.invoke('greenapi-session', {
          body: { action: 'create_instance' },
        });
        if (error) throw error;
        const newId = (data as any)?.instance_id;
        if (!newId) {
          setQrNote((data as any)?.error ?? 'לא ניתן ליצור חיבור אישי כרגע');
          setQrLoading(false);
          return;
        }
        setInstanceId(String(newId));
      }
      const { data, error } = await supabase.functions.invoke('greenapi-session', {
        body: { action: 'qr' },
      });
      if (error) throw error;
      if ((data as any)?.status === 'connected') {
        setStatus('connected');
        if ((data as any)?.phone) setPhone(String((data as any).phone).replace(/\D/g, ''));
        setQrNote('המספר כבר מחובר. לחיבור מספר אחר יש להתנתק קודם.');
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

  // Poll while the dialog is open so the card flips to "מחובר" right after scan.
  useEffect(() => {
    if (!qrOpen) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('greenapi-session', { body: { action: 'status' } });
        if ((data as any)?.status === 'connected') {
          setStatus('connected');
          if ((data as any)?.phone) setPhone(String((data as any).phone).replace(/\D/g, ''));
          setQrOpen(false);
          toast.success('המספר האישי חובר בהצלחה');
          void load();
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [qrOpen, load]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await supabase.functions.invoke('greenapi-session', { body: { action: 'logout' } });
      setStatus('disconnected');
      setPhone('');
      toast.success('המספר האישי נותק');
      void load();
    } catch (e: any) {
      toast.error(`הניתוק נכשל: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const connected = status === 'connected';

  return (
    <Card data-keep dir="rtl" className="border-0 bg-transparent text-right shadow-none">
      <CardContent className="space-y-2 p-0">
        {loading ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {connected && (
              <div className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="gap-1 rounded-full border-0 bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.75} /> מחובר
                  </Badge>
                  <span className="text-sm font-medium" dir="ltr">
                    {phone ? formatPhoneDisplay(phone) : '—'}
                  </span>
                </div>
                {instanceId && (
                  <p className="text-[11px] text-muted-foreground" dir="ltr">
                    Instance {instanceId}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 p-0 m-0">
              {personalSelected && (
                <Button variant="outline" size="sm" onClick={openQr} disabled={busy}
                  className="px-2 text-xs whitespace-nowrap">
                  <QrCode className="ml-1 h-3.5 w-3.5" />
                  {connected ? 'חיבור מספר אחר' : 'סריקת QR'}
                </Button>
              )}
              {connected && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy}
                      className="px-2 text-xs text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent dir="rtl" className="text-right">
                    <AlertDialogHeader>
                      <AlertDialogTitle>לנתק את המספר האישי?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ההודעות במרחב העבודה יפסיקו להישלח ולהתקבל מהמספר הזה עד לחיבור מחדש.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ביטול</AlertDialogCancel>
                      <AlertDialogAction onClick={disconnect}>ניתוק</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
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
