import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { CreditCard, Landmark, Loader2, LockKeyhole, Smartphone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GrowPaymentMethod, GrowCustomerField } from '../../../supabase/functions/_shared/growPayment';
import { toast } from 'sonner';
type Offer = { title: string; benefits: string; duration_days: number; amount_ils: number; environment: string; methods: { id: GrowPaymentMethod; fields: GrowCustomerField[] }[] };
const methodLabels: Record<GrowPaymentMethod, string> = { card: 'כל סוגי האשראי', bit: 'ביט', apple_pay: 'Apple Pay', google_pay: 'Google Pay', bank_transfer: 'העברה בנקאית' };
const fieldLabels = { full_name: 'שם מלא', phone: 'נייד לקבלת סיכום', email: 'אימייל', national_id: 'תעודת זהות' };
export function GrowSubscriptionPurchase() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ full_name: '', phone: '', email: '', national_id: '' });
  const [method, setMethod] = useState<GrowPaymentMethod | ''>('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const offer = useQuery({ queryKey: ['grow-subscription-offer'], queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'offer' } });
    if (error) throw error;
    return data.offer as Offer | null;
  }});
  const entitlements = useQuery({ queryKey: ['grow-my-entitlements'], refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('grow_subscription_entitlements').select('title,expires_at').gt('expires_at', new Date().toISOString());
    if (error) throw error;
    return data;
  }});
  const selected = offer.data?.methods.find(m => m.id === method);
  const fields = Array.from(new Set<GrowCustomerField>([...(selected?.fields ?? []), 'phone']));
  const valid = !!selected && fields.every(field => field === 'phone' ? /^05\d{8}$/.test(values.phone) : field === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) : field === 'national_id' ? /^\d{9}$/.test(values.national_id) : values.full_name.trim().split(/\s+/).length >= 2);
  if (!offer.data && !entitlements.data?.length) return null;
  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'create', payment_method: method, ...Object.fromEntries(fields.map(f => [f, values[f]])) } });
      if (error || !data?.payment_url) throw new Error();
      setLink(data.payment_url);
    } catch { toast.error('יצירת קישור התשלום נכשלה; לא הופעל מנוי'); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4">
    {entitlements.data?.map((e, index) => <p key={index} className="text-sm"><span className="font-semibold">{e.title}</span> · פעיל עד {new Date(e.expires_at).toLocaleDateString('he-IL')}</p>)}
    {offer.data && <Button variant="outline" onClick={() => setOpen(true)}>{offer.data.title} · ₪6,500</Button>}
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setLink(null); setConsent(false); } }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>{offer.data?.title}</DialogTitle></DialogHeader>
      <p className="text-2xl font-semibold">₪{offer.data?.amount_ils.toLocaleString('he-IL')}</p>
      {offer.data?.environment === 'sandbox' && <p role="status" className="text-sm text-destructive">תשלום בדיקה</p>}
      {!link && <>
        <div className="space-y-2"><Label>אמצעי תשלום</Label><Select value={method} onValueChange={v => setMethod(v as GrowPaymentMethod)}><SelectTrigger aria-label="אמצעי תשלום"><SelectValue placeholder="בחירת אמצעי תשלום" /></SelectTrigger><SelectContent>
          {Object.entries(methodLabels).map(([id, label]) => { const available = offer.data?.methods.some(m => m.id === id); const Icon = id === 'card' ? CreditCard : id === 'bank_transfer' ? Landmark : Smartphone; return <SelectItem key={id} value={id} disabled={!available}><span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span></SelectItem>; })}
        </SelectContent></Select></div>
        {selected && fields.map(field => <div key={field} className="space-y-2"><Label htmlFor={`grow-${field}`}>{fieldLabels[field]}</Label><Input id={`grow-${field}`} dir={field === 'full_name' ? 'rtl' : 'ltr'} type={field === 'email' ? 'email' : 'text'} inputMode={field === 'phone' ? 'tel' : field === 'national_id' ? 'numeric' : undefined} maxLength={field === 'phone' ? 10 : field === 'national_id' ? 9 : 150} value={values[field]} onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))} /></div>)}
        <details className="text-sm"><summary className="cursor-pointer">תנאי המנוי</summary><p className="mt-2 whitespace-pre-wrap">{offer.data?.duration_days} ימים · חיוב יחיד, ללא חידוש אוטומטי{ '\n' }{offer.data?.benefits}</p></details>
        <Label className="flex items-center gap-2"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} />אישור תנאי המנוי והתשלום</Label>
      </>}
      {link ? <Button asChild className="mt-3 min-h-12 w-full"><a href={link}><LockKeyhole className="h-4 w-4" />תשלום מאובטח</a></Button> : <Button className="mt-3 min-h-12 w-full" onClick={create} disabled={busy || !consent || !valid}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}תשלום מאובטח</Button>}
    </DialogContent></Dialog>
  </section>;
}
