import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { GrowCustomerField } from '../../../supabase/functions/_shared/growPayment';

const fieldLabels: Record<GrowCustomerField, string> = { full_name: 'שם מלא', phone: 'נייד לקבלת אישור התשלום', email: 'אימייל', national_id: 'תעודת זהות' };
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 10);

/** Personal WhatsApp number: 59 ILS monthly card subscription, paid before the request is accepted. */
export function PersonalWhatsAppSubscriptionCard() {
  const [whatsapp, setWhatsapp] = useState('');
  const [values, setValues] = useState<Record<GrowCustomerField, string>>({ full_name: '', phone: '', email: '', national_id: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const request = useQuery({
    queryKey: ['personal-whatsapp-request'],
    refetchInterval: (q) => (q.state.data && q.state.data !== 'none' ? false : link ? 10_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.from('personal_whatsapp_requests').select('status').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []).some(r => r.status !== 'awaiting_payment') ? 'received' as const : 'none' as const;
    },
  });
  const offer = useQuery({
    queryKey: ['personal-whatsapp-offer'],
    enabled: request.data === 'none',
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'personal_wa_offer' } });
      if (error) throw error;
      return data as { available: boolean; amount_ils: number; methods: { id: string; fields: GrowCustomerField[] }[] };
    },
  });

  if (request.isPending) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (request.data === 'received') return (
    <div role="status" className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(142_70%_40%)]" />
      <span>הבקשה התקבלה ומטופלת מייד. נעדכן אותך כשהמספר מחובר.</span>
    </div>
  );

  const fields = Array.from(new Set<GrowCustomerField>([...(offer.data?.methods[0]?.fields ?? []), 'phone']));
  const valid = /^05\d{8}$/.test(whatsapp) && fields.every(f => f === 'phone' ? /^05\d{8}$/.test(values.phone) : f === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) : f === 'national_id' ? /^\d{9}$/.test(values.national_id) : values.full_name.trim().split(/\s+/).length >= 2);
  const available = offer.data?.available === true && !!offer.data.methods.length;

  async function pay() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'personal_wa_create', whatsapp_phone: whatsapp, terms_accepted: true, ...Object.fromEntries(fields.map(f => [f, values[f]])) } });
      if (error || !data?.payment_url) throw new Error();
      setLink(data.payment_url);
      window.open(data.payment_url, '_blank', 'noopener');
    } catch { toast.error('לא הצלחנו לפתוח את דף התשלום. אפשר לנסות שוב.'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 rounded-lg border p-3">
        <span className="text-sm">שליחת הודעות מהמספר האישי שלך</span>
        <span className="whitespace-nowrap text-lg font-semibold">59 ₪ לחודש</span>
      </div>
      {offer.isPending ? <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : !available ? (
        <p className="text-sm text-muted-foreground">התשלום יהיה זמין כאן בקרוב.</p>
      ) : (
        <>
          <div className="space-y-1.5"><Label htmlFor="pwa-number">מספר הוואטסאפ האישי</Label><Input id="pwa-number" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={whatsapp} onChange={e => setWhatsapp(digits(e.target.value))} /></div>
          {fields.map(f => <div key={f} className="space-y-1.5"><Label htmlFor={`pwa-${f}`}>{fieldLabels[f]}</Label><Input id={`pwa-${f}`} dir={f === 'full_name' ? 'rtl' : 'ltr'} type={f === 'email' ? 'email' : 'text'} inputMode={f === 'phone' ? 'tel' : f === 'national_id' ? 'numeric' : undefined} value={values[f]} onChange={e => setValues(v => ({ ...v, [f]: f === 'phone' ? digits(e.target.value) : e.target.value }))} /></div>)}
          <Label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} />אני מאשר/ת חיוב חודשי מתחדש של 59 ₪ בכרטיס האשראי, עד לביטול.</Label>
          {link
            ? <Button asChild className="min-h-11 w-full"><a href={link} target="_blank" rel="noopener"><LockKeyhole className="h-4 w-4" />מעבר לתשלום מאובטח</a></Button>
            : <Button className="min-h-11 w-full" disabled={busy || !consent || !valid} onClick={pay}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}תשלום מאובטח</Button>}
          {link && <p className="text-xs text-muted-foreground">אחרי התשלום, האישור יופיע כאן.</p>}
        </>
      )}
    </div>
  );
}
