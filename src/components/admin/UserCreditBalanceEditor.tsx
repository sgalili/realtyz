import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

export const validCreditBalance = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value));
export function UserCreditBalanceEditor({ userId, name, balance }: { userId: string; name: string; balance?: { balance_ils: number; balance_credits: number } }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const save = useMutation({ mutationFn: async () => {
    if (!balance || !validCreditBalance(value)) throw new Error('invalid_credit_balance');
    const { data, error } = await supabase.rpc('super_admin_set_credit_balance', { _user_id: userId, _credits: Number(value), _expected_balance_ils: balance.balance_ils });
    if (error) throw error;
    return Number(data);
  }, onSuccess: async () => {
    setEditing(false);
    await Promise.all(['admin-credit-balances', 'credit-wallet', 'wallet-ledger', 'admin-system-stats'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    toast.success('יתרת הקרדיטים נשמרה');
  }, onError: async (error) => {
    await qc.invalidateQueries({ queryKey: ['admin-credit-balances'] });
    toast.error(error.message.includes('balance_changed') ? 'היתרה השתנתה; בדקו את היתרה המעודכנת ונסו שוב' : 'שמירת יתרת הקרדיטים נכשלה');
    setEditing(false);
  }});
  if (!balance) return <span className="text-muted-foreground">—</span>;
  return editing ? <form className="flex min-w-52 items-center gap-1" onSubmit={e => { e.preventDefault(); if (!save.isPending && validCreditBalance(value)) save.mutate(); }}>
    <Input aria-label={`יתרת קרדיטים עבור ${name}`} className="w-28" dir="ltr" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} disabled={save.isPending} autoFocus aria-invalid={!validCreditBalance(value)} />
    <Button type="submit" variant="ghost" size="icon" title="שמירת יתרה" aria-label={`שמירת יתרה עבור ${name}`} disabled={save.isPending || !validCreditBalance(value)}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button type="button" variant="ghost" size="icon" title="ביטול" aria-label="ביטול עריכת יתרה" disabled={save.isPending} onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
  </form> : <div className="flex min-w-32 items-center gap-1"><span dir="ltr" className="tabular-nums">{Number(balance.balance_credits).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span><Button variant="ghost" size="icon" title="עריכת יתרת קרדיטים" aria-label={`עריכת יתרת קרדיטים עבור ${name}`} onClick={() => { setValue(String(Number(balance.balance_credits.toFixed(2)))); setEditing(true); }}><Pencil className="h-4 w-4" /></Button></div>;
}