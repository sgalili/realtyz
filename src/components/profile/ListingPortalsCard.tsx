import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Link2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type Field = { col: string; label: string; type?: 'text' | 'password'; dir?: 'ltr' | 'rtl'; placeholder?: string };
type Portal = {
  id: 'homely' | 'yad2' | 'madlan';
  label: string;
  description: string;
  link: string;
  fields: Field[];
};

const PORTALS: Portal[] = [
  {
    id: 'homely',
    label: 'Homely',
    description: 'התחברות לחשבון Homely (Webtiv) + מפתח API לדחיפת לידים אוטומטית ל-OpenCard',
    link: 'https://www.homely.co.il/',
    fields: [
      { col: 'homely_agency', label: 'קוד משרד (Client)', dir: 'ltr', placeholder: 'agency code' },
      { col: 'homely_username', label: 'שם משתמש', dir: 'ltr' },
      { col: 'homely_password', label: 'סיסמה', type: 'password', dir: 'ltr', placeholder: '••••••••' },
      { col: 'homely_api_key', label: 'API Key (OpenCard — אופציונלי)', type: 'password', dir: 'ltr', placeholder: 'Homely API key' },
    ],
  },
  {
    id: 'yad2',
    label: 'יד2',
    description: 'סנכרון נכסים ולידים מ-yad2.co.il',
    link: 'https://www.yad2.co.il/',
    fields: [
      { col: 'yad2_username', label: 'שם משתמש / Email', dir: 'ltr' },
      { col: 'yad2_api_key', label: 'API Key / Token', type: 'password' },
    ],
  },
  {
    id: 'madlan',
    label: 'מדלן',
    description: 'סנכרון נכסים ולידים מ-madlan.co.il',
    link: 'https://www.madlan.co.il/',
    fields: [
      { col: 'madlan_username', label: 'שם משתמש / Email', dir: 'ltr' },
      { col: 'madlan_api_key', label: 'API Key / Token', type: 'password' },
    ],
  },
];

export function ListingPortalsCard() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [homelyHasPassword, setHomelyHasPassword] = useState(false);
  const [homelyStatus, setHomelyStatus] = useState<string>('not_configured');
  const [shown, setShown] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Yad2 / Madlan creds from user_api_keys
      const { data: keys } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      const v: Record<string, string> = {};
      ['yad2_username', 'yad2_api_key', 'madlan_username', 'madlan_api_key', 'homely_api_key'].forEach((c) => {
        v[c] = (keys as any)?.[c] ?? '';
      });

      // Homely creds from dedicated table (password is encrypted server-side)
      const { data: cred } = await supabase
        .from('homely_broker_credentials' as any)
        .select('homely_username, homely_agency, connection_status, homely_password_encrypted')
        .eq('user_id', user.id)
        .maybeSingle();
      v['homely_agency'] = (cred as any)?.homely_agency ?? '';
      v['homely_username'] = (cred as any)?.homely_username ?? '';
      v['homely_password'] = '';
      setHomelyHasPassword(Boolean((cred as any)?.homely_password_encrypted));
      setHomelyStatus((cred as any)?.connection_status ?? 'not_configured');

      setValues(v);
      setLoading(false);
    })();
  }, [user?.id]);

  const saveHomely = async () => {
    if (!user?.id) return;
    const agency = (values.homely_agency ?? '').trim();
    const username = (values.homely_username ?? '').trim();
    const password = (values.homely_password ?? '').trim();
    const apiKey = (values.homely_api_key ?? '').trim();
    if (!agency) { toast.error('יש להזין קוד משרד Homely'); return; }
    if (!username) { toast.error('יש להזין שם משתמש Homely'); return; }
    if (!password && !homelyHasPassword) { toast.error('יש להזין סיסמת Homely'); return; }
    setSaving('homely');
    try {
      const { error: upErr } = await supabase
        .from('homely_broker_credentials' as any)
        .upsert({
          user_id: user.id,
          homely_agency: agency,
          homely_username: username,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
      if (upErr) throw upErr;

      if (password) {
        const { error: pwErr } = await supabase.rpc('set_homely_password' as any, {
          _user_id: user.id,
          _password: password,
        });
        if (pwErr) throw pwErr;
        setHomelyHasPassword(true);
        setValues((s) => ({ ...s, homely_password: '' }));
      }

      // Persist API key (OpenCard auto-push) in user_api_keys
      const { error: keyErr } = await supabase
        .from('user_api_keys')
        .upsert({
          user_id: user.id,
          homely_api_key: apiKey || null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
      if (keyErr) throw keyErr;
      toast.success('✅ פרטי Homely נשמרו');
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setSaving(null);
    }
  };

  const verifyHomely = async () => {
    const agency = (values.homely_agency ?? '').trim();
    if (!agency) { toast.error('יש להזין קוד משרד Homely לפני בדיקת התחברות'); return; }
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('homely-verify-login', { body: {} });
      if (error) throw error;
      if ((data as any)?.ok) {
        setHomelyStatus('ok');
        toast.success('החיבור ל-Homely בוצע בהצלחה! המערכת מוכנה למשיכת נתונים.');
        // Kick off the property hydration pipeline; do not block the UI.
        supabase.functions
          .invoke('homely-search', { body: { hydrate: true } })
          .catch((e) => console.warn('[homely] hydrate after verify failed', e));
      } else {
        setHomelyStatus('failed');
        toast.error(`שגיאה באימות מול הומלי: אנא ודא כי קוד המשרד (${agency}) ומפתח ה-API תקינים.`);
      }
    } catch (e: any) {
      setHomelyStatus('failed');
      toast.error(e?.message ?? `שגיאה באימות מול הומלי: אנא ודא כי קוד המשרד (${agency}) ומפתח ה-API תקינים.`);
    } finally {
      setVerifying(false);
    }
  };


  const savePortal = async (p: Portal) => {
    if (p.id === 'homely') return saveHomely();
    if (!user?.id) return;
    setSaving(p.id);
    try {
      const patch: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
      p.fields.forEach((f) => { patch[f.col] = (values[f.col] ?? '').trim() || null; });
      const { error } = await supabase
        .from('user_api_keys')
        .upsert(patch as any, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success(`חיבור ${p.label} נשמר`);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Link2 className="h-4 w-4 text-primary" />
          חיבורים לפורטלי נדל"ן
        </CardTitle>
        <CardDescription className="text-right">
          חברו את החשבונות שלכם ב-Homely, יד2 ומדלן כדי לסנכרן נכסים ולידים אוטומטית.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : PORTALS.map((p) => {
          const isHomely = p.id === 'homely';
          const configured = isHomely
            ? Boolean((values.homely_agency ?? '').trim() && (values.homely_username ?? '').trim() && homelyHasPassword)
            : p.fields.every((f) => (values[f.col] ?? '').trim().length > 0);
          return (
            <div key={p.id} className="rounded-lg border bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {isHomely && homelyStatus === 'ok' && (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-300">מאומת</Badge>
                    )}
                    {configured && <Badge variant="outline" className="text-emerald-700 border-emerald-300">מחובר</Badge>}
                    <span className="font-semibold">{p.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
                {/* External site link removed per product spec */}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {p.fields.map((f) => (
                  <div key={f.col} className="space-y-1.5">
                    <Label htmlFor={f.col} className="text-xs">
                      {f.label}
                      {isHomely && f.col === 'homely_password' && homelyHasPassword && (
                        <span className="text-muted-foreground mr-1">(שמורה — מלאו רק כדי להחליף)</span>
                      )}
                    </Label>
                    {f.type === 'password' ? (
                      <div className="relative">
                        <Input
                          id={f.col}
                          type={shown[f.col] ? 'text' : 'password'}
                          dir={f.dir ?? 'ltr'}
                          value={values[f.col] ?? ''}
                          onChange={(e) => setValues((s) => ({ ...s, [f.col]: e.target.value }))}
                          placeholder={f.placeholder ?? f.label}
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShown((s) => ({ ...s, [f.col]: !s[f.col] }))}
                          className="absolute inset-y-0 left-2 flex items-center text-muted-foreground hover:text-foreground"
                          aria-label={shown[f.col] ? 'הסתר' : 'הצג'}
                        >
                          {shown[f.col] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    ) : (
                      <Input
                        id={f.col}
                        type={f.type ?? 'text'}
                        dir={f.dir ?? 'ltr'}
                        value={values[f.col] ?? ''}
                        onChange={(e) => setValues((s) => ({ ...s, [f.col]: e.target.value }))}
                        placeholder={f.placeholder ?? f.label}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-start gap-2">
                <Button size="sm" onClick={() => savePortal(p)} disabled={saving === p.id} className="gap-2">
                  {saving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  שמירת {p.label}
                </Button>
                {isHomely && (
                  <Button size="sm" variant="outline" onClick={verifyHomely} disabled={verifying || !homelyHasPassword} className="gap-2">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    בדיקת התחברות
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
