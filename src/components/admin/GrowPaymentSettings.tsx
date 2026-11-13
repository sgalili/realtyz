import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlugZap, Save } from 'lucide-react';
import { toast } from 'sonner';
import { growConfigurationReady } from '../../../supabase/functions/_shared/growPayment';

const defaults = { environment: 'sandbox', business_id: '', verification_phone: '', sending_mode: 'none', subscription_title: '', duration_days: '', benefits: '', enabled: false };
export function GrowPaymentSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState(defaults);
  const [busy, setBusy] = useState<'save'|'test'|null>(null);
  const settings = useQuery({ queryKey: ['grow-admin-settings'], queryFn: async () => {
    const { data, error } = await supabase.from('grow_payment_settings').select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    return data;
  }});
  const status = useQuery({ queryKey: ['grow-admin-connection', settings.data?.environment], queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'status' } });
    if (error) throw error;
    return data as { configured: boolean; environment: string; terms_ready: boolean };
  }});
  useEffect(() => { if (settings.data) setForm({ ...settings.data, duration_days: String(settings.data.duration_days ?? '') }); }, [settings.data]);
  const set = (key: keyof typeof defaults, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  async function save() {
    const duration = form.duration_days ? Number(form.duration_days) : null;
    if (form.business_id && !/^\d{9}$/.test(form.business_id)) { toast.error('יש להזין מספר זהות או ח״פ בן 9 ספרות'); return; }
    if (form.verification_phone && !/^05\d{8}$/.test(form.verification_phone)) { toast.error('יש להזין מספר נייד תקין'); return; }
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 3650)) { toast.error('יש להזין תקופה תקינה בימים'); return; }
    if (form.enabled && (!growConfigurationReady({ ...form, duration_days: duration }) || !status.data?.configured || status.data.environment !== form.environment)) { toast.error('נדרש חיבור Make ותנאי מנוי מלאים לפני הפעלה'); return; }
    setBusy('save');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('יש להתחבר מחדש');
      const { error } = await supabase.from('grow_payment_settings').upsert({ id: true, ...form, duration_days: duration, updated_by: auth.user.id, updated_at: new Date().toISOString() });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['grow-admin-settings'] });
      await qc.invalidateQueries({ queryKey: ['grow-admin-connection'] });
      toast.success('הגדרות התשלום נשמרו');
    } catch { toast.error('שמירת ההגדרות נכשלה'); } finally { setBusy(null); }
  }
  async function test() {
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'test' } });
      if (error || !data?.connected) throw new Error();
      toast.success('החיבור ל־Grow דרך Make אומת');
    } catch { toast.error('לא ניתן לאמת את החיבור. יש לחבר את תרחיש Make של הסביבה השמורה.'); } finally { setBusy(null); }
  }
  if (settings.isLoading) return <Loader2 className="h-5 w-5 animate-spin" aria-label="טוען הגדרות" />;
  if (settings.error) return <p role="alert" className="text-destructive">לא ניתן לטעון את הגדרות התשלום</p>;
  return <section className="mx-auto max-w-3xl space-y-6" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">תשלומי Grow דרך Make</h2><Badge variant={status.data?.configured ? 'secondary' : 'outline'}>{status.data?.configured ? 'Make מחובר' : status.error ? 'מצב החיבור אינו זמין' : 'Make טרם חובר'}</Badge></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label>סביבה</Label><Select value={form.environment} onValueChange={v => set('environment', v)}><SelectTrigger aria-label="סביבת Grow"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sandbox">Grow Sandbox · בדיקות</SelectItem><SelectItem value="live">Grow · חי</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label>אופן שליחה ברירת מחדל</Label><Select value={form.sending_mode} onValueChange={v => set('sending_mode', v)}><SelectTrigger aria-label="אופן שליחה"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">ללא שליחה</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="grow-business">מספר תעודת זהות או ח״פ</Label><Input id="grow-business" dir="ltr" inputMode="numeric" value={form.business_id} onChange={e => set('business_id', e.target.value)} maxLength={9} /></div>
      <div className="space-y-2"><Label htmlFor="grow-phone">נייד לאימות חשבון</Label><Input id="grow-phone" dir="ltr" inputMode="tel" value={form.verification_phone} onChange={e => set('verification_phone', e.target.value)} maxLength={10} /></div>
    </div>
    <p className="text-sm text-muted-foreground">אימות החשבון וקוד האימות מתבצעים ב־Make; שמירת פרטים כאן אינה מחברת חשבון Grow.</p>
    <div className="border-t pt-5 space-y-4">
      <h3 className="text-lg font-semibold">מנוי · ₪6,500</h3>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="grow-title">שם המנוי</Label><Input id="grow-title" value={form.subscription_title} maxLength={150} onChange={e => set('subscription_title', e.target.value)} /></div><div className="space-y-2"><Label htmlFor="grow-duration">תקופת המנוי בימים</Label><Input id="grow-duration" type="number" min={1} max={3650} value={form.duration_days} onChange={e => set('duration_days', e.target.value)} /></div></div>
      <div className="space-y-2"><Label htmlFor="grow-benefits">הטבות המנוי</Label><Textarea id="grow-benefits" value={form.benefits} maxLength={4000} onChange={e => set('benefits', e.target.value)} /></div>
      <p className="text-sm text-muted-foreground">חיוב יחיד, ללא חידוש אוטומטי. הפעלה דורשת תנאים מלאים ואישור תשלום; תשלום בדיקה אינו מעניק מנוי פעיל.</p>
      <Label className="flex items-center gap-3"><Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} />אפשר רכישת מנוי</Label>
    </div>
    <div className="flex justify-between gap-3"><Button variant="outline" onClick={test} disabled={!!busy || !status.data?.configured}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}בדיקת חיבור</Button><Button onClick={save} disabled={!!busy}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button></div>
  </section>;
}