import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { lovable } from '@/integrations/lovable';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';
import { ArrowRight, Mail, MessageSquareText } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';
import { RealtyzWave } from '@/components/RealtyzWave';

type AuthMethod = 'google' | 'whatsapp' | 'sms' | 'email';

const AUTH_HEADER_HEADLINES: { key: string; node: JSX.Element }[] = [
  { key: 'h1', node: <>ה<strong>פלטפורמה היחידה</strong> שתצטרכו לקמפיין שלכם</> },
  { key: 'h2', node: <>בלי צורך בספקים חיצוניים: <strong>ווטסאפ, SMS ואימייל</strong> - הכל בפנים</> },
  { key: 'h3', node: <><strong>ניהול שטח, CRM ואסטרטגיה</strong> במקום אחד - בלי פשרות</> },
  { key: 'h4', node: <><strong>עליונות טכנולוגית</strong> שמשאירה את המתחרים מאחור</> },
  { key: 'h5', node: <>מערכת ה-AI היחידה בישראל ש<strong>מנהלת את הליד מקצה לקצה</strong></> },
];

const AUTH_HEADER_ROTATION_MS = 6000;

const GoogleLogo = () => (
  <svg className="auth-google-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path className="auth-google-blue" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path className="auth-google-green" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path className="auth-google-yellow" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path className="auth-google-red" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
  </svg>
);

const WhatsAppLogo = () => (
  <svg className="auth-whatsapp-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path className="auth-whatsapp-circle" d="M20.52 3.48A11.86 11.86 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.3-1.65a11.9 11.9 0 0 0 5.77 1.47h.01c6.56 0 11.9-5.34 11.92-11.9 0-3.18-1.24-6.17-3.48-8.44Z" />
    <path className="auth-whatsapp-glyph" d="M12.08 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.64-.24-.38a9.84 9.84 0 0 1-1.5-5.27c0-5.44 4.43-9.87 9.88-9.87a9.8 9.8 0 0 1 6.98 2.9 9.82 9.82 0 0 1 2.89 6.99c-.01 5.44-4.44 9.87-9.87 9.87Zm5.41-7.39c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.46-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
  </svg>
);


const Auth = () => {
  const { setDemoMode } = useDemoMode();

  // Force demo OFF whenever the user lands on /auth
  useEffect(() => {
    window.localStorage.setItem('realtyz-demo-mode', 'false');
    setDemoMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthDemoToggle = (checked: boolean) => {
    if (checked) {
      // Turning ON → enable demo and go to dashboard
      window.localStorage.setItem('realtyz-demo-mode', 'true');
      setDemoMode(true);
      window.location.assign('/');
    } else {
      // Already off - ensure off and stay on /auth
      window.localStorage.setItem('realtyz-demo-mode', 'false');
      setDemoMode(false);
    }
  };

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [activeMethod, setActiveMethod] = useState<AuthMethod>('whatsapp');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [headerHeadlineIndex, setHeaderHeadlineIndex] = useState(0);
  // Match dashboard hero wave: random seed on mount (1-100) for unique rhythm per visit
  const [heroWaveSeed] = useState(() => Math.floor(Math.random() * 100) + 1);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    const googleOneTap = (window as any).google?.accounts?.id;
    if (!clientId || !googleOneTap) return;
    googleOneTap.initialize({
      client_id: clientId,
      callback: async ({ credential }: { credential?: string }) => {
        if (!credential) return;
        window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential });
        if (error) toast.error(error.message);
      },
    });
    googleOneTap.prompt();
  }, []);

  useEffect(() => {
    if (!codeSent || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [codeSent, resendSeconds]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeaderHeadlineIndex((current) => (current + 1) % AUTH_HEADER_HEADLINES.length);
    }, AUTH_HEADER_ROTATION_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const isPhoneFlow = activeMethod === 'whatsapp' || activeMethod === 'sms';
  const isGoogleFlow = activeMethod === 'google';
  const plainPhone = phone.replace(/\D/g, '');
  const formattedPhone = plainPhone.length > 3 ? `${plainPhone.slice(0, 3)}-${plainPhone.slice(3, 10)}` : plainPhone;
  const canSubmit = isPhoneFlow ? /^05\d-\d{7}$/.test(formattedPhone) : /\S+@\S+\.\S+/.test(email);

  // Preview host = Lovable preview sandbox. Skip real OTP delivery and accept
  // the master secret OTP "9321" for sign-in / sign-up (super-admin override).
  const isPreviewHost = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('id-preview--') ||
    window.location.hostname.endsWith('.lovable.dev') ||
    window.location.hostname.endsWith('.lovableproject.com') ||
    window.location.hostname.endsWith('.lovable.app') ||
    window.location.hostname === 'realtyz.kalpiz.co.il' ||
    window.location.hostname === 'realtyz.udiman.com'
  );

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits);
  };

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isGoogleFlow) return;
    setLoading(true);

    // Preview-mode bypass: never send a real OTP.
    if (isPreviewHost) {
      setCodeSent(true);
      setResendSeconds(0);
      setOtpAttempts(0);
      setOtp('');
      setLoading(false);
      toast.success('מצב Preview: השתמשו בקוד המאסטר 9321');
      return;
    }

    const normalizedPhone = formattedPhone.replace(/^0/, '+972').replace('-', '');
    const { error } = activeMethod === 'whatsapp'
      ? await supabase.functions.invoke('whatsapp-auth', { body: { action: 'send', phone: normalizedPhone } })
      : activeMethod === 'sms'
        ? await supabase.auth.signInWithOtp({ phone: normalizedPhone })
        : await supabase.functions.invoke('email-auth', { body: { action: 'send', email } });
    if (error) {
      // Real OTP delivery failed (e.g. unconfigured WhatsApp gateway).
      // Still open the code-entry screen so the master OTP override can be used.
      setCodeSent(true);
      setResendSeconds(0);
      setOtpAttempts(0);
      setOtp('');
      toast.message('לא ניתן לשלוח קוד כרגע. ניתן להזין קוד מאסטר אם יש לך.');
    } else {
      setCodeSent(true);
      setResendSeconds(60);
      setOtpAttempts(0);
      setOtp('');
      toast.success('קוד אימות נשלח אליך');
    }
    setLoading(false);
  };

  // Try the master-OTP bypass. Returns true if it succeeded and the session is set.
  const tryMasterOtp = async (code: string, normalizedPhone: string): Promise<boolean> => {
    const { data, error: fnErr } = await supabase.functions.invoke('preview-master-auth', {
      body: {
        identifier: isPhoneFlow ? normalizedPhone : email,
        kind: isPhoneFlow ? 'phone' : 'email',
        code,
      },
    });
    if (fnErr || !data?.token_hash) return false;
    const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' } as any);
    return !vErr;
  };

  const handleVerifyCode = async (code = otp) => {
    const expectedLength = isPreviewHost ? 4 : (activeMethod === 'sms' ? 6 : 4);
    if (isGoogleFlow || code.length !== expectedLength || loading || otpAttempts >= 3) return;
    setLoading(true);
    window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
    const normalizedPhone = formattedPhone.replace(/^0/, '+972').replace('-', '');

    // Always attempt master-OTP first (works on any host with the correct master code).
    if (code.length === 4) {
      const ok = await tryMasterOtp(code, normalizedPhone);
      if (ok) { setLoading(false); return; }
      if (isPreviewHost) {
        setOtpAttempts((a) => a + 1);
        setOtp('');
        toast.error('קוד מאסטר שגוי');
        setLoading(false);
        return;
      }
    }

    const { error } = activeMethod === 'whatsapp'
      ? await supabase.functions.invoke('whatsapp-auth', { body: { action: 'verify', phone: normalizedPhone, code } }).then(async ({ data, error }) => {
          if (error) return { error };
          if (!data?.token_hash) return { error: new Error('קוד אומת, אך הכניסה נכשלה') };
          return await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' } as any);
        })
      : activeMethod === 'sms'
        ? await supabase.auth.verifyOtp({ phone: normalizedPhone, token: code, type: 'sms' })
        : await supabase.functions.invoke('email-auth', { body: { action: 'verify', email, code } }).then(async ({ data, error }) => {
            if (error) return { error };
            if (!data?.token_hash) return { error: new Error('קוד אומת, אך הכניסה נכשלה') };
            return await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' } as any);
          });
    if (error) {
      setOtpAttempts((attempts) => attempts + 1);
      setOtp('');
      toast.error(otpAttempts + 1 >= 3 ? 'יותר מדי ניסיונות. שלחו קוד חדש.' : error.message);
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
      extraParams: { prompt: 'select_account' },
    });
    if (result.error) {
      window.localStorage.removeItem(DEMO_EXIT_PENDING_KEY);
      toast.error(result.error.message);
    }
    if (!result.redirected && !result.error) window.location.assign('/');
    setLoading(false);
  };

  return (
    <div
      className="auth-gradient-shell min-h-screen relative overflow-hidden px-4 py-8"
    >
      {/* Gold halo */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-gold/10 blur-[120px]" />
      {/* Top header bar with auth-only rotating headline and Demo switch */}
      <div className="absolute inset-x-0 top-0 z-20 h-7 bg-background" dir="rtl">
        <div className="absolute right-4 left-4 top-[calc(50%+5px)] -translate-y-1/2 overflow-hidden text-right">
          <div className="auth-header-ticker" aria-live="polite">
            {AUTH_HEADER_HEADLINES.map((line, index) => (
              <span
                key={line.key}
                className={cn(
                  'auth-header-ticker-line absolute inset-0 flex items-center justify-start transition-opacity duration-[900ms] ease-in-out',
                  index === headerHeadlineIndex ? 'opacity-100' : 'opacity-0',
                )}
              >
                {line.node}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Top hero wave - cloned exactly from dashboard HeroWaveMount: wave-soft, 24px, background fill, random seed */}
      <RealtyzWave position="top" variant="wave-soft" fill="hsl(var(--background))" seed={heroWaveSeed} height={24} offset={28} />
      <RealtyzWave position="bottom" variant="wave-soft" fill="hsl(var(--background))" seed={7} height={24} />
      {codeSent && !isGoogleFlow && (
        <button type="button" aria-label="חזרה להתחברות" className="absolute right-4 top-16 z-20 border-0 bg-transparent p-0 text-primary-foreground" onClick={() => { setCodeSent(false); setOtp(''); setOtpAttempts(0); setResendSeconds(0); }}>
          <ArrowRight className="h-10 w-10" />
        </button>
      )}

      <div className="auth-hero-content relative z-10 mx-auto w-full" dir="rtl">
        <div className="mb-8 translate-y-5 text-center">
          <div className="realtyz-logo auth-text-logo" aria-label="Realtyz">Realtyz</div>
          <p className="auth-official-slogan">הפלטפורמה שהופכת דאטה קרה למכונת המרה</p>
        </div>

        {!codeSent && <h1 className="auth-login-title">הרשמה/התחברות</h1>}

        <Card variant="active" className={codeSent ? "auth-login-card border-0 bg-transparent shadow-none" : "auth-login-card border-0 bg-transparent shadow-none"} dir="rtl">
          <CardContent className={codeSent ? "p-0" : "space-y-5 p-6"}>
            <form onSubmit={handleSendCode} className={codeSent ? "space-y-4 animate-fade-in" : "space-y-4 rounded-lg border border-border/80 bg-background p-4 animate-fade-in"}>
              {codeSent && !isGoogleFlow ? (
                <div className="space-y-4 text-center animate-fade-in">
                  <Label className="block text-xl font-bold text-primary-foreground">הזינו את הקוד שקיבלתם {activeMethod === 'whatsapp' ? 'בווטסאפ' : activeMethod === 'sms' ? 'ב-SMS' : 'באימייל'}</Label>
                  <InputOTP maxLength={isPreviewHost ? 4 : (activeMethod === 'sms' ? 6 : 4)} value={otp} onChange={(value) => { const len = isPreviewHost ? 4 : (activeMethod === 'sms' ? 6 : 4); setOtp(value); if (value.length === len) void handleVerifyCode(value); }} containerClassName="justify-center" dir="ltr" disabled={otpAttempts >= 3}>
                    <InputOTPGroup className="flex-row-reverse gap-2">
                      {Array.from({ length: isPreviewHost ? 4 : (activeMethod === 'sms' ? 6 : 4) }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} className="h-20 w-20 rounded-md border bg-background p-0 text-7xl font-black leading-none text-primary" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  {activeMethod === 'sms' && <Button type="button" className="auth-gold-button w-full" onClick={() => handleVerifyCode()} disabled={loading || otp.length !== 6}>
                    {loading ? 'מאמת...' : 'כניסה למערכת'}
                  </Button>}
                  {resendSeconds > 0 ? (
                    <p className="text-sm font-bold text-muted-foreground">שלחו לי שוב בעוד {resendSeconds}</p>
                  ) : (
                    <button type="button" className="text-sm font-normal text-primary-foreground underline-offset-4 hover:underline" onClick={() => handleSendCode()} disabled={loading}>
                      שלחו לי שוב
                    </button>
                  )}
                </div>
              ) : isGoogleFlow ? (
                <Button type="button" className="auth-provider-button auth-provider-google" onClick={handleGoogleLogin} disabled={loading}>
                  <GoogleLogo />
                  כניסה עם גוגל
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label className="auth-method-label" htmlFor={isPhoneFlow ? 'auth-phone' : 'auth-email'}>{activeMethod === 'whatsapp' ? 'מה מספר הווטסאפ שלך?' : isPhoneFlow ? 'מה מספר הטלפון שלך?' : 'מה האימייל שלך?'}</Label>
                  <div className={`auth-method-field ${activeMethod === 'whatsapp' ? 'auth-method-field-whatsapp' : ''} ${activeMethod === 'sms' ? 'auth-method-field-sms' : ''} ${activeMethod === 'email' ? 'auth-method-field-email' : ''}`}>
                    {activeMethod === 'whatsapp' ? (
                      <WhatsAppLogo />
                    ) : activeMethod === 'sms' ? (
                      <MessageSquareText className="auth-sms-mark h-5 w-5" />
                    ) : (
                      <Mail className="h-5 w-5" />
                    )}
                    <Input
                      id={isPhoneFlow ? 'auth-phone' : 'auth-email'}
                      className="auth-method-input"
                      type={isPhoneFlow ? 'tel' : 'email'}
                      inputMode={isPhoneFlow ? 'tel' : 'email'}
                      placeholder={isPhoneFlow ? '05x-xxxxxxx' : 'you@campaign.com'}
                      value={isPhoneFlow ? formattedPhone : email}
                      onChange={(e) => (isPhoneFlow ? handlePhoneChange(e.target.value) : setEmail(e.target.value))}
                      required
                      dir="ltr"
                    />
                  </div>
                </div>
              )}
              {!codeSent && !isGoogleFlow && canSubmit && (
                <Button type="submit" className={`auth-submit-button auth-submit-${activeMethod} w-full animate-fade-in`} disabled={loading}>
                  {loading ? 'שולח...' : activeMethod === 'whatsapp' ? 'שלחו לי קוד בווטסאפ' : activeMethod === 'sms' ? 'שלחו לי קוד ב SMS' : 'שלחו לי קוד באימייל'}
                </Button>
              )}
            </form>

            {!codeSent && <div className="text-center text-sm font-bold text-primary-foreground">
              <div>או באמצעות:</div>
            </div>}

            {!codeSent && <div className="auth-method-tabs" role="tablist" aria-label="אפשרויות כניסה">
              <Button type="button" className="auth-method-tab auth-provider-google" onClick={handleGoogleLogin} disabled={loading} aria-pressed={activeMethod === 'google'}>
                <GoogleLogo />
                גוגל
              </Button>
              {activeMethod === 'sms' ? (
                <Button type="button" className="auth-method-tab auth-provider-whatsapp" onClick={() => { setActiveMethod('whatsapp'); setCodeSent(false); setOtp(''); }} disabled={loading} aria-pressed={false}>
                  <WhatsAppLogo />
                  ווטסאפ
                </Button>
              ) : (
                <Button type="button" className="auth-method-tab auth-provider-sms" onClick={() => { setActiveMethod('sms'); setCodeSent(false); setOtp(''); }} disabled={loading} aria-pressed={false}>
                  <MessageSquareText className="auth-sms-mark" />
                  SMS
                </Button>
              )}
              {activeMethod === 'email' ? (
                <Button type="button" className="auth-method-tab auth-provider-whatsapp" onClick={() => { setActiveMethod('whatsapp'); setCodeSent(false); setOtp(''); }} disabled={loading} aria-pressed={false}>
                  <WhatsAppLogo />
                  ווטסאפ
                </Button>
              ) : (
                <Button type="button" variant="outline" className="auth-method-tab auth-provider-email" onClick={() => { setActiveMethod('email'); setCodeSent(false); setOtp(''); }} disabled={loading} aria-pressed={false}>
                  <Mail />
                  אימייל
                </Button>
              )}
            </div>}
          </CardContent>
        </Card>
      </div>

      <footer className="auth-page-footer" dir="rtl">
        <p className="auth-footer-credit">
          נבנה ב- <span className="auth-heart" aria-label="אהבה">❤️</span> עבור סוכני הנדל"ן המובילים בישראל
        </p>
        <div className="auth-footer-wave-band">
          <div className="auth-footer-white-wave" aria-hidden="true" />
        </div>
        <div className="auth-footer-legal">
          <span dir="ltr" className="auth-footer-copyright">© 2026 Realtyz. All rights reserved</span>
          <div className="auth-footer-links">
            <a href="/privacy">מדיניות פרטיות</a>
            <a href="/terms">תנאי שימוש</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Auth;
