import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Infinity as InfinityIcon, Loader2, LockKeyhole, Network, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDeveloperSubscription } from '@/hooks/useDeveloperSubscription';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaymentMethodLogo } from './PaymentMethodLogo';
import { developerPlanQuote } from '../../../supabase/functions/_shared/developerSubscription';
import type { GrowCustomerField, GrowPaymentMethod } from '../../../supabase/functions/_shared/growPayment';

const methods: { id: GrowPaymentMethod; label: string }[] = [
  { id: 'card', label: 'כרטיס אשראי' },
  { id: 'bit', label: 'ביט' },
  { id: 'apple_pay', label: 'Apple Pay' },
  { id: 'google_pay', label: 'Google Pay' },
  { id: 'bank_transfer', label: 'העברה בנקאית' },
];
const fieldLabels: Record<GrowCustomerField, string> = { full_name: 'שם מלא', phone: 'מה הטלפון הנייד שלך?', email: 'אימייל', national_id: 'תעודת זהות' };
type MethodCapability = { id: GrowPaymentMethod; fields: GrowCustomerField[] };
type DeveloperOffer = { environment: 'sandbox' | 'live'; methods: MethodCapability[] };
const quote = developerPlanQuote();
export const DEVELOPER_PLAN_PENDING_KEY = 'toraff:developer-plan-pending';

export function DeveloperSubscriptionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const subscription = useDeveloperSubscription(open);
  const [method, setMethod] = useState<GrowPaymentMethod | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<GrowCustomerField, string>>({ full_name: '', phone: '', email: '', national_id: '' });
  const offer = useQuery({
    queryKey: ['developer-subscription-offer', user?.id, activeWorkspaceId],
    enabled: open && !!user && !subscription.data?.active,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'developer_offer' } });
      if (error || data?.error) throw new Error('payment_options_unavailable');
      return data.offer as DeveloperOffer;
    },
  });
  useEffect(() => {
    setMethod(null); setConsent(false); setBusy(false);
    setValues({ full_name: '', phone: '', email: '', national_id: '' });
  }, [user?.id, activeWorkspaceId]);

  const selected = offer.data?.methods.find(item => item.id === method);
  const previewFields: GrowCustomerField[] = method === 'card' ? ['national_id', 'phone'] : ['phone'];
  const fields = Array.from(new Set<GrowCustomerField>([...(selected?.fields ?? previewFields), 'phone']));
  const fieldsValid = fields.every(field => field === 'phone' ? /^05\d{8}$/.test(values.phone) : field === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) : field === 'national_id' ? /^\d{9}$/.test(values.national_id) : values.full_name.trim().split(/\s+/).length >= 2);
  const valid = consent && !!method && (user ? !!selected && fieldsValid : true);

  async function pay() {
    if (!valid || busy || !method) return;
    if (!user) {
      try { localStorage.setItem(DEVELOPER_PLAN_PENDING_KEY, '1'); } catch { /* authentication still remains available */ }
      navigate('/auth', { state: { signup: true } });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'developer_create', payment_method: method, terms_accepted: true, ...Object.fromEntries(fields.map(field => [field, values[field]])) } });
      if (error || !data?.payment_url) throw new Error('checkout_unavailable');
      window.location.assign(data.payment_url);
    } catch {
      toast.error('לא ניתן לפתוח תשלום מאובטח; המנוי לא הופעל');
      setBusy(false);
    }
  }

  const active = subscription.data?.active === true;
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent dir="rtl" className="max-h-[94dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-0">
      <div className="bg-primary px-5 py-6 text-primary-foreground sm:px-8">
        <DialogHeader className="space-y-3 text-right">
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Building2 className="h-8 w-8" />מנוי יזמים TORAFF</DialogTitle>
          <DialogDescription className="text-base text-primary-foreground/85">כל הפרויקטים, הנכסים והכלים המקצועיים במקום אחד.</DialogDescription>
        </DialogHeader>
      </div>
      {active ? <div className="space-y-5 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"><Check className="h-8 w-8" /></span>
        <h2 className="text-2xl font-bold">{subscription.data?.expires_at ? 'המנוי פעיל' : 'גישת הניהול פעילה'}</h2>
        {subscription.data?.expires_at && <p className="text-lg text-muted-foreground">הגישה בתוקף עד {new Date(subscription.data.expires_at).toLocaleDateString('he-IL')}</p>}
        <p className="text-lg">אפשר לייבא ולפרסם פרויקטים, בניינים ויחידות ללא הגבלת כמות.</p>
        <Button className="min-h-12 w-full text-lg" onClick={() => { onOpenChange(false); navigate('/developer-dashboard'); }}>לפרויקטים שלי</Button>
      </div> : <div className="space-y-6 p-5 sm:p-8">
        <section className="text-center" aria-label="מחיר מנוי יזמים">
          <div className="flex items-center justify-center gap-4" dir="ltr">
            <span className="relative inline-flex px-1 py-1 text-2xl font-semibold text-muted-foreground" aria-label="מחיר רגיל ₪13,000">
              <span>₪13,000</span><span aria-hidden className="absolute left-[-8%] top-1/2 h-[2px] w-[116%] -rotate-12 rounded-full bg-muted-foreground" />
            </span>
            <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">₪9,500</span>
          </div>
          <p className="mt-2 text-xl font-semibold">+ מע״מ / חודש</p>
          <p className="mt-2 text-base text-muted-foreground">סה״כ לחיוב הראשון: <bdi dir="ltr">₪11,210</bdi> כולל מע״מ</p>
        </section>
        <ul className="grid gap-3 text-lg sm:grid-cols-3">
          <li className="rounded-xl border bg-card p-4"><InfinityIcon className="mb-2 h-6 w-6 text-primary" /><strong className="block">פרויקטים ונכסים ללא הגבלה</strong><span className="mt-1 block text-base text-muted-foreground">ייבוא ופרסום של כל הפרויקטים, הבניינים והיחידות.</span></li>
          <li className="rounded-xl border bg-card p-4"><Sparkles className="mb-2 h-6 w-6 text-primary" /><strong className="block">כל הוצאות ה-AI כלולות</strong><span className="mt-1 block text-base text-muted-foreground">ריטה והכלים החכמים כלולים במנוי.</span></li>
          <li className="rounded-xl border bg-card p-4"><Network className="mb-2 h-6 w-6 text-primary" /><strong className="block">רשת שותפים מקצועית</strong><span className="mt-1 block text-base text-muted-foreground">חשיפה ושיתופי פעולה עם בעלי מקצוע.</span></li>
        </ul>
        <p className="text-base text-muted-foreground">קמפיינים חיצוניים יכולים לחייב קרדיטים נוספים, לפי הבחירה והמחיר המוצג. החיוב כעת הוא עבור החודש הראשון.</p>
        {offer.data?.environment === 'sandbox' && <p role="status" className="rounded-lg border border-destructive/40 p-3 text-base text-destructive">סביבת תשלום לבדיקה בלבד; היא אינה מפעילה מנוי פעיל.</p>}
        {!method ? <div className="grid gap-2 sm:grid-cols-2">{methods.map(({ id, label }) => <Button key={id} type="button" variant="outline" className="min-h-16 justify-start gap-3 text-lg" onClick={() => setMethod(id)}><PaymentMethodLogo method={id} />{label}</Button>)}</div> : <div className="space-y-4">
          <div className="flex items-center gap-3"><Button type="button" variant="ghost" onClick={() => setMethod(null)}>החלפת אמצעי תשלום</Button><PaymentMethodLogo method={method} /><span className="text-lg font-semibold">{methods.find(item => item.id === method)?.label}</span></div>
          {user && fields.map(field => <div key={field} className="space-y-2"><Label className="text-base" htmlFor={`developer-${field}`}>{fieldLabels[field]}</Label><Input id={`developer-${field}`} dir={field === 'full_name' ? 'rtl' : 'ltr'} type={field === 'email' ? 'email' : 'text'} inputMode={field === 'phone' ? 'tel' : field === 'national_id' ? 'numeric' : undefined} maxLength={field === 'phone' ? 10 : field === 'national_id' ? 9 : 150} value={values[field]} onChange={event => setValues(previous => ({ ...previous, [field]: event.target.value }))} /></div>)}
          {method === 'card' && <p className="border-s-2 border-border ps-3 text-base text-muted-foreground">מספר הכרטיס, התוקף וקוד האבטחה מוזנים בעמוד התשלום המאובטח בלבד.</p>}
          {method === 'bit' && <p className="text-base text-muted-foreground">אימות המספר ואישור התשלום יושלמו בביט.</p>}
          {method === 'bank_transfer' && <p className="text-base text-muted-foreground">פרטי ההעברה והאסמכתה יוצגו בעמוד התשלום. הגישה תיפתח רק לאחר אישור קבלת התשלום.</p>}
          {user && !selected && <p role="status" className="text-base text-muted-foreground">התשלום ייפתח לאחר השלמת חיבור אמצעי התשלום.</p>}
        </div>}
        <Label className="flex cursor-pointer items-start gap-3 text-lg leading-relaxed"><Checkbox className="mt-1 h-5 w-5" checked={consent} onCheckedChange={value => setConsent(value === true)} /><span>הסכמה ל<a href="/terms" target="_blank" rel="noreferrer" className="mx-1 text-primary">תנאי התקנון</a></span></Label>
        <Button type="button" className="min-h-14 w-full text-xl" disabled={!valid || busy || offer.isLoading} onClick={() => void pay()}>{busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <LockKeyhole className="h-6 w-6" />}{user ? 'לתשלום מאובטח' : 'הרשמה ומעבר לתשלום'}</Button>
        <p className="text-center text-sm text-muted-foreground">הגישה נפתחת אוטומטית רק לאחר אימות התשלום מול Grow. מעבר חזרה מהתשלום אינו מפעיל מנוי.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}
