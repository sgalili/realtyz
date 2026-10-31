import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from '@/i18n/personalToast';
import { ArrowRight, User, UserRound, X } from 'lucide-react';
import realtyzLogo from '@/assets/realtyz-logo.webp';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearPendingSignupRole } from '@/lib/signupRole';
import { formatAuthMobile, israeliMobile, saveSmsSignup, smsSignupSchema } from '@/lib/smsSignup';

// Gray, unbolded placeholder; black bold typed text; no border/ring on focus.
const fieldClass = 'h-12 min-w-0 text-lg font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [signup, setSignup] = useState(location.state?.signup !== false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const mobile = israeliMobile.safeParse(phone);
  const profile = smsSignupSchema.safeParse({ firstName, lastName, gender, phone });
  const ready = mobile.success && (!signup || profile.success);
  useEffect(() => { clearPendingSignupRole(); }, []);
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);
  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!ready || !mobile.success || loading || resendSeconds > 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-auth', { body: { action: 'send_sms', phone: `+${mobile.data}` } });
      if (error || data?.error) throw new Error(data?.error ?? 'לא ניתן לשלוח קוד כרגע. נסו שוב.');
      if (signup && profile.success) saveSmsSignup(profile.data);
      setCodeSent(true); setOtp(''); setAttempts(0); setResendSeconds(60);
      toast.success('קוד האימות נשלח ב-SMS');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'שליחת הקוד נכשלה'); }
    finally { setLoading(false); }
  };
  const verify = async (code = otp) => {
    if (!mobile.success || code.length !== 4 || loading || attempts >= 3) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-auth', { body: { action: 'verify', phone: `+${mobile.data}`, code } });
      if (error || data?.error) throw new Error(data?.error ?? 'קוד האימות אינו תקין');
      // The server verifies OTP; there are no client master-code or alternate-provider paths.
      let result: { error: unknown } = data?.session ? await supabase.auth.setSession(data.session)
        : data?.token_hash ? await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
        : { error: new Error('הכניסה נכשלה. נסו שוב.') };
      if (result.error && data?.token_hash) result = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
      if (result.error) throw result.error;
      navigate('/', { replace: true });
    } catch (error) {
      setAttempts(value => value + 1); setOtp('');
      toast.error(attempts + 1 >= 3 ? 'שלחו קוד חדש ונסו שוב.' : error instanceof Error ? error.message : 'האימות נכשל');
    } finally { setLoading(false); }
  };
  return <div dir="rtl" className="auth-gradient-shell relative flex h-[100dvh] flex-col overflow-hidden bg-background px-4 pb-14 text-foreground">
    <Button type="button" variant="ghost" size="icon" aria-label="סגירת ההרשמה וחזרה לדף הבית" className="absolute left-4 top-4 z-20 h-10 w-10 bg-transparent p-1 hover:bg-transparent" onClick={() => navigate('/')}><X className="h-8 w-8" /></Button>
    <Button type="button" variant="ghost" size="icon" aria-label="חזרה" className="absolute right-4 top-4 h-10 w-10" onClick={() => { if (codeSent) { setCodeSent(false); setOtp(''); } else navigate('/'); }}><ArrowRight className="h-8 w-8" /></Button>
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col items-center pt-[40px]">
      <img src={realtyzLogo} alt="TORAFF" className="h-14 w-auto shrink-0 object-contain" />
      <h1 className={`mb-8 mt-[50px] text-center !font-normal ${codeSent ? 'text-xl' : 'text-[17px]'}`}>{codeSent ? gender === 'female' ? 'הזיני את הקוד שקיבלת ב-SMS' : gender === 'male' ? 'הזן את הקוד שקיבלת ב-SMS' : 'הזינו את הקוד שקיבלתם ב-SMS' : signup ? 'להרשמה מהירה בחינם:' : 'כניסה לחשבון'}</h1>
      <div className="min-h-0 w-full overflow-y-auto overscroll-contain">
        {codeSent ? <div className="space-y-5 text-center">
          <InputOTP maxLength={4} value={otp} onChange={value => { setOtp(value); if (value.length === 4) void verify(value); }} containerClassName="justify-center" dir="ltr" disabled={loading || attempts >= 3}>
            <InputOTPGroup className="gap-2">{[0, 1, 2, 3].map(index => <InputOTPSlot key={index} index={index} className="h-16 w-16 rounded-md border bg-background text-[38px] font-bold text-primary focus-visible:outline-none focus-visible:ring-0 aria-[current=true]:ring-0" />)}</InputOTPGroup>
          </InputOTP>
          <Button type="button" className="w-full" disabled={loading || otp.length !== 4 || attempts >= 3} onClick={() => void verify()}>{loading ? 'מאמת...' : 'אימות הקוד'}</Button>
          <Button type="button" variant="link" disabled={loading || resendSeconds > 0} onClick={() => void sendCode()}>{resendSeconds > 0 ? `שליחה חוזרת בעוד ${resendSeconds}` : 'שלחו לי קוד שוב'}</Button>
        </div> : <form onSubmit={sendCode} className="space-y-3">
          {signup && <div className="grid grid-cols-2 gap-3">
            <Input aria-label="שם פרטי" placeholder="שם פרטי" autoComplete="given-name" maxLength={80} className={fieldClass} value={firstName} onChange={e => setFirstName(e.target.value)} />
            <Input aria-label="שם משפחה" placeholder="שם משפחה" autoComplete="family-name" maxLength={80} className={fieldClass} value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>}
          <div className={signup ? 'grid grid-cols-2 gap-3' : ''}>
            <Input type="tel" inputMode="tel" autoComplete="tel" aria-label="מספר טלפון נייד" placeholder="מספר טלפון נייד" maxLength={11} className={fieldClass} dir={phone ? 'ltr' : 'rtl'} value={phone} onChange={e => setPhone(formatAuthMobile(e.target.value))} />
            {signup && <div role="group" aria-label="מגדר" className="flex min-w-0 gap-1">{[['male', 'גבר', User], ['female', 'אישה', UserRound]].map(([value, label, Icon]) => <Button key={value as string} type="button" variant={gender === value ? 'default' : 'outline'} aria-pressed={gender === value} className="h-12 min-w-0 flex-1 gap-1 px-2 text-lg font-normal" onClick={() => setGender(value as string)}><Icon className="h-5 w-5 shrink-0" />{label as string}</Button>)}</div>}
          </div>
          {ready && <Button type="submit" disabled={loading} className="h-12 w-full text-xl font-bold">{loading ? 'שולח...' : 'שלחו לי קוד ב-SMS'}</Button>}
        </form>}
      </div>
    </div>
    {!codeSent && <div className="absolute inset-x-0 bottom-[68px] flex justify-center">
      <Button type="button" variant="link" className="text-base text-muted-foreground underline decoration-dotted underline-offset-4" onClick={() => { setSignup(value => !value); setOtp(''); }}>{signup ? 'יש לי חשבון' : 'פתח חשבון חדש'}</Button>
    </div>}
  </div>;
};
export default Auth;
