import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/** Super Admin one-off charge. Card number and CVV are typed only on Grow's secure page, never in TORAFF. */
export function QuickCardChargeCard() {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const valid = value >= 1 && value <= 100000 && /^05\d{8}$/.test(phone);
  async function charge() {
    if (!window.confirm(`לחייב ₪${value.toLocaleString('he-IL')} כולל מע״מ?`)) return;
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('grow-payments', { body: { action: 'quick_charge', amount_ils: Math.round(value * 100) / 100, full_name: name, phone, title } });
      if (error || !data?.payment_url) throw new Error(data?.error ?? 'failed');
      if (tab) tab.location.href = data.payment_url; else window.location.href = data.payment_url;
      toast.success('דף החיוב המאובטח נפתח');
    } catch {
      tab?.close();
      toast.error('לא ניתן לפתוח חיוב. יש לוודא שחיבור Grow פעיל');
    } finally { setBusy(false); }
  }
  return (
    <Card dir="rtl">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" />חיוב מהיר בכרטיס אשראי</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="qc-amount">סכום כולל מע״מ (₪)</Label><Input id="qc-amount" dir="ltr" type="number" min={1} max={100000} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="qc-title">תיאור החיוב</Label><Input id="qc-title" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="qc-name">שם בעל הכרטיס</Label><Input id="qc-name" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="qc-phone">נייד לקבלה</Label><Input id="qc-phone" dir="ltr" inputMode="tel" maxLength={10} value={phone} onChange={e => setPhone(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">מספר הכרטיס, התוקף וה־CVV מוזנים בדף התשלום המאובטח של Grow שנפתח מיד.</p>
        <Button className="w-full" onClick={() => void charge()} disabled={!valid || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}חיוב עכשיו</Button>
      </CardContent>
    </Card>
  );
}
