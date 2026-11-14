import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CreditCard, Landmark, Loader2, LockKeyhole, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GrowCustomerField, GrowPaymentMethod } from '../../../supabase/functions/_shared/growPayment';
import { toast } from 'sonner';

const methods: { id: GrowPaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { id: 'bit', label: 'ביט', icon: Smartphone },
  { id: 'card', label: 'כל סוגי כרטיסי האשראי', icon: CreditCard },
  { id: 'apple_pay', label: 'Apple Pay', icon: Smartphone },
  { id: 'google_pay', label: 'Google Pay', icon: Smartphone },
  { id: 'bank_transfer', label: 'העברה בנקאית', icon: Landmark },
];
const labels: Record<GrowCustomerField, string> = { full_name: 'שם מלא', phone: 'נייד לקבלת סיכום', email: 'אימייל', national_id: 'תעודת זהות' };
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
  const fields = Array.from(new Set<GrowCustomerField>([...(selected?.fields ?? []), 'phone']));
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
    {!method ? <div className="grid gap-2">{methods.map(({ id, label, icon: Icon }) => <Button key={id} variant="outline" className="min-h-12 w-full justify-start gap-3" disabled={offer.isLoading} onClick={() => setMethod(id)}><Icon className="h-5 w-5 shrink-0" />{label}{!offer.isLoading && !offer.data?.methods.some(m => m.id === id) && <span className="ms-auto text-xs text-muted-foreground">לא זמין כרגע</span>}</Button>)}</div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void pay(); }}>
      <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label="בחירת אמצעי תשלום אחר" onClick={() => setMethod(null)}><ArrowRight className="h-5 w-5" /></Button><span className="font-semibold">{methods.find(m => m.id === method)?.label}</span></div>
      <div className="space-y-2"><Label htmlFor="topup-amount">סכום להפקדה (₪)</Label><Input id="topup-amount" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></div>
      {fields.map(field => <div key={field} className="space-y-2"><Label htmlFor={`topup-${field}`}>{labels[field]}</Label><Input id={`topup-${field}`} dir={field === 'full_name' ? 'rtl' : 'ltr'} type={field === 'email' ? 'email' : 'text'} inputMode={field === 'phone' ? 'tel' : field === 'national_id' ? 'numeric' : undefined} maxLength={field === 'phone' ? 10 : field === 'national_id' ? 9 : 150} value={values[field]} onChange={event => setValues(previous => ({ ...previous, [field]: event.target.value }))} /></div>)}
      {!selected && <p role="status" className="text-sm text-muted-foreground">אמצעי התשלום אינו זמין כרגע.</p>}
      <Button type="submit" className="min-h-12 w-full" disabled={!valid || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}תשלום מאובטח</Button>
    </form>}
  </div>;
}