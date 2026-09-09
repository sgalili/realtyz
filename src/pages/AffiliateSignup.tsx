// Public affiliate registration + login (/affiliates).
//
// A collaborating broker who only wants to market other brokers' listings for
// commission lands here. No CRM, no office tooling: sign up, get the affiliate
// role, and land straight in the affiliate portal.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, Handshake, Sparkles, TrendingUp } from 'lucide-react';
import { publicUrl } from '@/lib/publicUrl';

const PERKS = [
  { icon: Building2, title: 'מאגר נכסים משותף', text: 'נכסים למכירה ולהשכרה שמתווכים פתחו לשיווק על ידכם.' },
  { icon: Handshake, title: 'עמלה ב-3 שלבים', text: 'תגמול על ליד חם, תגמול כפול על ליד שאומת, ובונוס בסגירת עסקה.' },
  { icon: TrendingUp, title: 'מעקב מלא', text: 'לוח מחוונים עם סטטוס כל איש קשר והתגמול שנצבר.' },
];

export default function AffiliateSignup() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in as an affiliate → straight to the portal.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) navigate('/affiliate', { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  const finish = async () => {
    // Idempotent: grants the affiliate role and upserts the payout profile.
    await supabase.rpc('register_as_affiliate', {
      _display_name: fullName.trim() || null,
      _phone: phone.trim() || null,
    });
    navigate('/affiliate', { replace: true });
  };

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      toast.error('נדרש אימייל וסיסמה באורך 6 תווים לפחות');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: publicUrl('/affiliates'),
            data: { full_name: fullName.trim() || null, phone: phone.trim() || null },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success('נשלח אימייל לאישור ההרשמה. לאחר האישור התחברו כאן.');
          setMode('login');
          return;
        }
        toast.success('נרשמתם לרשת השותפים');
        await finish();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await finish();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(
        message.toLowerCase().includes('invalid')
          ? 'אימייל או סיסמה שגויים'
          : 'הפעולה נכשלה, נסו שוב',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 md:grid-cols-2 md:py-16">
        <section className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
            <Sparkles className="h-3.5 w-3.5" />
            רשת השותפים של רילטיז
          </div>
          <h1 className="text-3xl font-bold leading-tight text-slate-900">
            שווקו נכסים של מתווכים אחרים והרוויחו עמלה בכל שלב
          </h1>
          <p className="text-sm text-slate-600">
            הצטרפו כשותפי שיווק, בחרו נכסים מהזירה המשותפת, הגישו אנשי קשר חמים וקבלו תגמול לפי מודל
            שלושת השלבים שהמתווך קבע לכל נכס.
          </p>
          <ul className="space-y-3">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <div>
                  <div className="text-sm font-bold text-slate-900">{p.title}</div>
                  <div className="text-[12px] text-slate-500">{p.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <Card className="h-fit border-slate-200">
          <CardHeader>
            <CardTitle className="text-right text-xl font-bold text-slate-900">
              כניסה לפורטל השותפים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'signup' | 'login')}>
              <TabsList className="w-full">
                <TabsTrigger value="signup" className="flex-1">הרשמה</TabsTrigger>
                <TabsTrigger value="login" className="flex-1">התחברות</TabsTrigger>
              </TabsList>

              <TabsContent value="signup" className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label>שם מלא</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="שם השותף" />
                </div>
                <div className="space-y-1.5">
                  <Label>טלפון</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05X-XXXXXXX" />
                </div>
              </TabsContent>

              <TabsContent value="login" className="pt-4" />

              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label>אימייל</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    inputMode="email"
                    dir="ltr"
                    placeholder="name@mail.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>סיסמה</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <Button className="w-full" disabled={busy} onClick={submit}>
                  {busy ? 'רגע...' : mode === 'signup' ? 'הצטרפות לרשת השותפים' : 'התחברות'}
                </Button>
                <p className="text-center text-[11px] text-slate-500">
                  ההרשמה חינם. התגמול נקבע לכל נכס על ידי המתווך המפרסם.
                </p>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
