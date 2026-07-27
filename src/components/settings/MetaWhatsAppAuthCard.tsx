import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BadgeCheck, Copy, Loader2, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';

type MetaCfg = {
  waba_id: string | null;
  phone_number_id: string | null;
  access_token_masked: string | null;
  has_pin: boolean;
  display_phone_number: string | null;
  verified_name: string | null;
  code_verification_status: string | null;
  registration_status: string | null;
  quality_rating: string | null;
  name_status: string | null;
  webhook_subscribed: boolean | null;
  authorized: boolean;
  authorized_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
};

async function callMeta(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('meta-wa-register', { body });
  if (error) throw new Error(error.message);
  if (data && data.success === false) throw new Error(String(data.error ?? 'שגיאה מול Meta'));
  return data as {
    success: boolean;
    authorized?: boolean;
    already_verified?: boolean;
    message?: string;
    config: MetaCfg;
  };
}

export function MetaWhatsAppAuthCard() {
  const queryClient = useQueryClient();
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-wa-webhook`;

  const { data: cfg, isFetching } = useQuery({
    queryKey: ['meta-wa-status'],
    queryFn: async () => {
      try {
        const res = await callMeta({ action: 'status' });
        return res.config;
      } catch {
        return null;
      }
    },
    refetchInterval: (query) => (query.state.data?.authorized ? false : 30_000),
  });

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => callMeta(body),
    onSuccess: (res) => {
      queryClient.setQueryData(['meta-wa-status'], res.config);
      toast.success(res.authorized ? 'המספר אושר ומחובר ל-Meta' : 'הפעולה הושלמה');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusBadge = useMemo(() => {
    if (cfg?.authorized) return { label: 'מאושר ומחובר', className: 'bg-green-600 text-white' };
    if (cfg?.code_verification_status === 'PENDING') return { label: 'ממתין לקוד אימות', className: 'bg-amber-500 text-white' };
    if (cfg?.phone_number_id) return { label: 'ממתין לאישור', className: 'bg-slate-500 text-white' };
    return { label: 'לא מוגדר', className: 'bg-muted text-muted-foreground' };
  }, [cfg]);

  const busy = run.isPending;

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-green-600" />
            אישור מספר WhatsApp רשמי (Meta Cloud API)
          </CardTitle>
          <CardDescription>
            רישום ואימות המספר העסקי מול Graph API והסרת סטטוס "ממתין לאישור".
          </CardDescription>
        </div>
        <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {cfg?.last_error && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="text-xs">{cfg.last_error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">WABA ID</Label>
            <Input dir="ltr" value={wabaId} placeholder={cfg?.waba_id ?? '1234567890'} onChange={(e) => setWabaId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone Number ID</Label>
            <Input dir="ltr" value={phoneNumberId} placeholder={cfg?.phone_number_id ?? '1234567890'} onChange={(e) => setPhoneNumberId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App / System User Access Token</Label>
            <Input dir="ltr" type="password" value={accessToken} placeholder={cfg?.access_token_masked ?? 'EAAG...'} onChange={(e) => setAccessToken(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">PIN דו-שלבי (6 ספרות)</Label>
            <Input dir="ltr" inputMode="numeric" maxLength={6} value={pin} placeholder={cfg?.has_pin ? '••••••' : '000000'} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run.mutate({
                action: 'save',
                ...(wabaId ? { waba_id: wabaId } : {}),
                ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
                ...(accessToken ? { access_token: accessToken } : {}),
              })
            }
          >
            שמור פרטי חיבור
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run.mutate({ action: 'request_code', code_method: 'SMS' })}>
            שלח קוד ב-SMS
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run.mutate({ action: 'request_code', code_method: 'VOICE' })}>
            שלח קוד בשיחה
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || isFetching} onClick={() => run.mutate({ action: 'status' })}>
            {isFetching || busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ms-1">רענן סטטוס</span>
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">קוד אימות מ-Meta (6 ספרות)</Label>
            <Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
          </div>
          <Button
            size="sm"
            className="gap-2"
            disabled={busy || code.length !== 6}
            onClick={() => run.mutate({ action: 'verify_code', code, ...(pin.length === 6 ? { pin } : {}) })}
          >
            <BadgeCheck className="h-4 w-4" />
            אמת ורשום מספר
          </Button>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <Info label="מספר תצוגה" value={cfg?.display_phone_number} />
          <Info label="שם מאומת" value={cfg?.verified_name} />
          <Info label="סטטוס אימות קוד" value={cfg?.code_verification_status} />
          <Info label="סטטוס רישום" value={cfg?.registration_status} />
          <Info label="דירוג איכות" value={cfg?.quality_rating} />
          <Info label="Webhook מנוי" value={cfg?.webhook_subscribed == null ? null : cfg.webhook_subscribed ? 'פעיל' : 'לא פעיל'} />
        </div>

        <div className="space-y-2 rounded-lg border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium">Meta Webhook Callback URL</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => {
                navigator.clipboard?.writeText(webhookUrl);
                toast.success('הכתובת הועתקה');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              העתק
            </Button>
          </div>
          <div dir="ltr" className="rounded-md border border-border/40 bg-background/70 px-3 py-2 text-left font-mono text-[11px] break-all">
            {webhookUrl}
          </div>
          <p className="text-[11px] text-muted-foreground">
            הירשם בשדות account_update, phone_number_name_update, phone_number_quality_update — הסטטוס יתעדכן אוטומטית.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span dir="ltr" className="font-mono text-[11px]">{value ?? '—'}</span>
    </div>
  );
}

export default MetaWhatsAppAuthCard;
