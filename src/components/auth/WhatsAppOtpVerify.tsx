/**
 * WhatsAppOtpVerify
 * -----------------
 * Reusable Hebrew RTL OTP widget that sends a verification code over the
 * OFFICIAL Meta WhatsApp Business number (via the `whatsapp-auth` edge
 * function, which uses an approved AUTHENTICATION template so codes arrive
 * even outside the 24h window).
 *
 * Use it for logins, affiliate/broker onboarding and any critical account
 * action. It never signs the user in by itself: it reports the verified
 * `token_hash` upward so the caller decides what to do.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  /** Pre-filled Israeli phone (05X-XXXXXXX or 9725XXXXXXXX). */
  defaultPhone?: string;
  /** Lock the phone field (critical actions on a known account). */
  lockPhone?: boolean;
  title?: string;
  description?: string;
  onVerified?: (result: { phone: string; token_hash?: string; session?: { access_token: string; refresh_token: string } }) => void;
  /** Also offer sending the code by SMS. */
  allowSms?: boolean;
  /** SMS only; WhatsApp/email appear only after "לא קיבלתי קוד". */
  smsOnly?: boolean;
  brokerVerification?: boolean;
  onEmailFallback?: () => void;
};

const RESEND_SECONDS = 45;

const normalize = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `+972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return `+${digits}`;
  return null;
};

export function WhatsAppOtpVerify({
  defaultPhone = '',
  lockPhone = false,
  title = 'אימות בוואטסאפ',
  description = 'נשלח קוד בן 4 ספרות מהמספר הרשמי שלנו בוואטסאפ.',
  onVerified,
  allowSms = false,
  smsOnly = false,
  brokerVerification = false,
  onEmailFallback,
}: Props) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (via: 'whatsapp' | 'sms' = 'whatsapp') => {
    const normalized = normalize(phone);
    if (!normalized) {
      setError('מספר וואטסאפ לא תקין');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('whatsapp-auth', {
      body: { action: via === 'sms' ? 'send_sms' : 'send', phone: normalized },
    });
    setBusy(false);
    if (fnError || data?.error) {
      setError(String(data?.error ?? fnError?.message ?? 'שליחת הקוד נכשלה'));
      return;
    }
    setChannel(data?.channel === 'sms' ? 'sms' : 'whatsapp');
    setSent(true);
    setCooldown(RESEND_SECONDS);
    toast.success(data?.channel === 'sms' ? 'הקוד נשלח ב-SMS' : 'הקוד נשלח בוואטסאפ');
  };

  const verify = async () => {
    const normalized = normalize(phone);
    if (!normalized || code.replace(/\D/g, '').length !== 4) {
      setError('הזן קוד בן 4 ספרות');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('whatsapp-auth', {
      body: { action: brokerVerification ? 'broker_verify' : 'verify', phone: normalized, code: code.replace(/\D/g, '') },
    });
    setBusy(false);
    if (fnError || data?.error) {
      setError(String(data?.error ?? fnError?.message ?? 'האימות נכשל'));
      return;
    }
    toast.success('האימות הושלם');
    onVerified?.({ phone: normalized, token_hash: data?.token_hash, session: data?.session });
  };

  return (
    <div dir="rtl" className="space-y-3">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="h-4 w-4 text-green-600" />
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Label className="text-xs">מספר וואטסאפ</Label>
        <Input
          dir="ltr"
          inputMode="tel"
          value={phone}
          disabled={lockPhone || busy}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {sent && (
        <div className="space-y-1">
          <Label className="text-xs">
            קוד האימות {channel === 'sms' ? '(נשלח ב-SMS)' : '(נשלח בוואטסאפ)'}
          </Label>
          <Input
            dir="ltr"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="1234"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!sent ? (
          <>
          {smsOnly ? <Button size="sm" disabled={busy} onClick={() => void send('sms')} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}שלח קוד ב-SMS</Button> : <Button size="sm" disabled={busy} onClick={() => void send('whatsapp')} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            שלח קוד בוואטסאפ
          </Button>}
          {allowSms && !smsOnly && <Button size="sm" variant="outline" disabled={busy} onClick={() => void send('sms')}>שלח קוד ב-SMS</Button>}
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy || code.length !== 4} onClick={verify} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              אמת קוד
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || cooldown > 0} onClick={() => void send(channel)}>
              {cooldown > 0 ? `שליחה חוזרת בעוד ${cooldown}` : 'שלח קוד מחדש'}
            </Button>
          </>
        )}
      </div>
      {smsOnly && !brokerVerification && sent && (fallbackOpen ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">אפשר להירשם גם בדרך אחרת:</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} className="gap-2" onClick={() => void send('whatsapp')}><MessageCircle className="h-4 w-4 text-green-600" />קוד בוואטסאפ</Button>
            {onEmailFallback && <Button size="sm" variant="outline" disabled={busy} onClick={onEmailFallback}>הרשמה באימייל</Button>}
          </div>
        </div>
      ) : <button type="button" className="text-xs font-semibold text-primary underline underline-offset-4" onClick={() => setFallbackOpen(true)}>לא קיבלתי קוד</button>)}
    </div>
  );
}

export default WhatsAppOtpVerify;
