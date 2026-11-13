import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
type Offer = { title: string; benefits: string; duration_days: number; amount_ils: number; environment: string };
export function GrowSubscriptionPurchase() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
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
  if (!offer.data && !entitlements.data?.length) return null;
  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'create', full_name: fullName, phone } });
      if (error || !data?.payment_url) throw new Error();
      setLink(data.payment_url);
    } catch { toast.error('יצירת קישור התשלום נכשלה; לא הופעל מנוי'); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4">
    {entitlements.data?.map((e, index) => <p key={index} className="text-sm"><span className="font-semibold">{e.title}</span> · פעיל עד {new Date(e.expires_at).toLocaleDateString('he-IL')}</p>)}
    {offer.data && <Button variant="outline" onClick={() => setOpen(true)}>{offer.data.title} · ₪6,500</Button>}
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setLink(null); setConsent(false); } }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{offer.data?.title}</DialogTitle></DialogHeader>
      <p className="text-lg font-semibold">₪6,500 · {offer.data?.duration_days} ימים</p>
      <p className="whitespace-pre-wrap">{offer.data?.benefits}</p>
      <p className="text-sm text-muted-foreground">חיוב יחיד, ללא חידוש אוטומטי. המנוי אינו טעינת ארנק.</p>
      {offer.data?.environment === 'sandbox' && <p role="status" className="text-sm text-destructive">תשלום בדיקה בלבד; לא יופעל מנוי חי.</p>}
      {link ? <><Button asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />פתיחת דף התשלום</a></Button><p className="text-sm text-muted-foreground">הפעלת המנוי תופיע רק לאחר אישור התשלום.</p></> : <>
        <div className="space-y-2"><Label htmlFor="grow-customer-name">שם מלא</Label><Input id="grow-customer-name" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="grow-customer-phone">נייד</Label><Input id="grow-customer-phone" dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <Label className="flex items-start gap-2"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} />קראתי ואני מאשר/ת את תנאי המנוי המוצגים ואת התשלום בסך ₪6,500</Label>
        <Button onClick={create} disabled={busy || !consent || !/^05\d{8}$/.test(phone) || fullName.trim().split(/\s+/).filter(n => n.length >= 2).length < 2}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}המשך לתשלום</Button>
      </>}
    </DialogContent></Dialog>
  </section>;
}