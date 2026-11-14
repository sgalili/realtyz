import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GrowCustomerField, GrowPaymentMethod } from '../../../supabase/functions/_shared/growPayment';
import { toast } from 'sonner';
import { PaymentMethodLogo } from './PaymentMethodLogo';

const methods: { id: GrowPaymentMethod; label: string }[] = [
  { id: 'bit', label: 'ביט' },
  { id: 'card', label: 'כרטיס אשראי' },
  { id: 'apple_pay', label: 'Apple Pay' },
  { id: 'google_pay', label: 'Google Pay' },
  { id: 'bank_transfer', label: 'העברה בנקאית' },
];
const labels: Record<GrowCustomerField, string> = { full_name: 'שם מלא', phone: 'מה הטלפון הנייד שלך?', email: 'אימייל', national_id: 'תעודת זהות' };
type Offer = { available: boolean; methods: { id: GrowPaymentMethod; fields: GrowCustomerField[] }[] };
export function WalletTopUp() {
  const [method, setMethod] = useState<GrowPaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [values, setValues] = useState({ full_name: '', phone: '', email: '', national_id: '' });
  const [busy, setBusy] = useState(false);
  const offer = useQuery({ queryKey: ['wallet-topup-offer'], queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'topup_offer' } });
    if (error || data?.error) throw new Error('payment_options_unavailable');
    return data as Offer;
  }});
  const selected = offer.data?.methods.find(m => m.id === method);
  const previewFields: GrowCustomerField[] = method === 'card' ? ['national_id', 'phone'] : ['phone'];
  const fields = Array.from(new Set<GrowCustomerField>([...(selected?.fields ?? previewFields), 'phone']));
  const valid = !!selected && Number(amount) > 0 && Number(amount) <= 10000 && /^\d+(\.\d{1,2})?$/.test(amount) && fields.every(field => field === 'phone' ? /^05\d{8}$/.test(values.phone) : field === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) : field === 'national_id' ? /^\d{9}$/.test(values.national_id) : values.full_name.trim().split(/\s+/).length >= 2);
  async function pay() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'topup_create', amount_ils: Number(amount), payment_method: method, ...Object.fromEntries(fields.map(field => [field, values[field]])) } });
      if (error || !data?.payment_url) throw new Error();
      window.location.assign(data.payment_url);
    } catch { toast.error('לא ניתן לפתוח תשלום מאובטח; הארנק לא זוכה'); setBusy(false); }
  }
  return <div className="space-y-4">
    {offer.isLoading && <Loader2 role="status" aria-label="טעינת אמצעי תשלום" className="mx-auto h-5 w-5 animate-spin" />}
    {offer.isError && <div role="alert" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">לא ניתן לטעון אמצעי תשלום<Button variant="ghost" onClick={() => void offer.refetch()}>ניסיון נוסף</Button></div>}
    {!method ? <div className="grid gap-2">{methods.map(({ id, label }) => <Button key={id} variant="outline" className="min-h-16 w-full justify-start gap-3" disabled={offer.isLoading} onClick={() => setMethod(id)}><PaymentMethodLogo key="logo" method={id} /><span key="label" className="payment-option-label">{label}</span></Button>)}</div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void pay(); }}>
      <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label="בחירת אמצעי תשלום אחר" onClick={() => setMethod(null)}><ArrowRight className="h-5 w-5" /></Button><PaymentMethodLogo method={method} /><span className="payment-option-label font-semibold">{methods.find(m => m.id === method)?.label}</span></div>
      <div className="space-y-2"><Label htmlFor="topup-amount">סכום להפקדה (₪)</Label><Input id="topup-amount" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></div>
      {fields.map(field => <div key={field} className="space-y-2"><Label htmlFor={`topup-${field}`}>{labels[field]}</Label><Input id={`topup-${field}`} dir={field === 'full_name' ? 'rtl' : 'ltr'} type={field === 'email' ? 'email' : 'text'} inputMode={field === 'phone' ? 'tel' : field === 'national_id' ? 'numeric' : undefined} maxLength={field === 'phone' ? 10 : field === 'national_id' ? 9 : 150} value={values[field]} onChange={event => setValues(previous => ({ ...previous, [field]: event.target.value }))} /></div>)}
      {method === 'card' && <div className="border-s-2 border-border ps-3 text-sm text-muted-foreground"><p>מספר כרטיס · תוקף · CVV</p><p>פרטי הכרטיס מוזנים בעמוד התשלום המאובטח בלבד.</p></div>}
      {method === 'bit' && <p className="text-sm text-muted-foreground">אימות המספר ואישור התשלום יושלמו בביט.</p>}
      {method === 'bank_transfer' && <div className="border-s-2 border-border ps-3 text-sm text-muted-foreground"><p>פרטי הבנק, הסניף, החשבון והאסמכתה יוצגו בעמוד התשלום.</p><p>הארנק יזוכה רק לאחר אישור קבלת ההעברה.</p></div>}
      {!selected && <p role="status" className="text-sm text-muted-foreground">התשלום ייפתח לאחר השלמת חיבור אמצעי התשלום.</p>}
      <Button type="submit" className="min-h-12 w-full" disabled={!valid || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : method === 'apple_pay' || method === 'google_pay' ? <PaymentMethodLogo method={method} /> : <LockKeyhole className="h-4 w-4" />}{method === 'apple_pay' ? 'תשלום עם Apple Pay' : method === 'google_pay' ? 'תשלום עם Google Pay' : 'תשלום מאובטח'}</Button>
    </form>}
  </div>;
}