import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const fmtCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExp = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

export function SaveCardForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [card, setCard] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [holderId, setHolderId] = useState('');
  const [auto, setAuto] = useState(true);
  const [amount, setAmount] = useState(200);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [mm, yy] = exp.split('/');
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('zcredit-save-card', {
      body: { card_number: card, exp_month: mm, exp_year: yy, cvv, holder_id: holderId, auto_recharge: auto, recharge_amount: amount },
    });
    setBusy(false);
    // Clear sensitive fields immediately regardless of outcome.
    setCard(''); setCvv('');
    let msg = (data as any)?.error as string | undefined;
    if (error && !msg) { try { msg = (await (error as any).context?.json())?.error; } catch { /* ignore */ } }
    if (error || msg) { toast.error(msg ?? 'שמירת הכרטיס נכשלה'); return; }
    toast.success('הכרטיס נשמר');
    qc.invalidateQueries({ queryKey: ['payment-methods'] });
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="on">
      <div className="space-y-1">
        <Label htmlFor="cc-num">מספר כרטיס</Label>
        <Input id="cc-num" dir="ltr" inputMode="numeric" autoComplete="cc-number" required value={card} onChange={(e) => setCard(fmtCard(e.target.value))} placeholder="0000 0000 0000 0000" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cc-exp">תוקף</Label>
          <Input id="cc-exp" dir="ltr" inputMode="numeric" autoComplete="cc-exp" required value={exp} onChange={(e) => setExp(fmtExp(e.target.value))} placeholder="MM/YY" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cc-cvv">CVV</Label>
          <Input id="cc-cvv" dir="ltr" type="password" inputMode="numeric" autoComplete="cc-csc" required maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cc-id">תעודת זהות של בעל הכרטיס</Label>
        <Input id="cc-id" dir="ltr" inputMode="numeric" required maxLength={9} value={holderId} onChange={(e) => setHolderId(e.target.value.replace(/\D/g, ''))} />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="cc-auto">טעינה אוטומטית כשהיתרה מתאפסת</Label>
        <Switch id="cc-auto" checked={auto} onCheckedChange={setAuto} />
      </div>
      {auto && (
        <div className="grid grid-cols-3 gap-2">
          {[200, 500, 1000].map((a) => (
            <Button key={a} type="button" variant={amount === a ? 'default' : 'outline'} onClick={() => setAmount(a)}>₪{a.toLocaleString('he-IL')}</Button>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />פרטי הכרטיס נשלחים ישירות לחברת הסליקה Z-Credit ואינם נשמרים אצלנו. נשמרות רק 4 הספרות האחרונות.</p>
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}שמירת כרטיס</Button>
    </form>
  );
}
