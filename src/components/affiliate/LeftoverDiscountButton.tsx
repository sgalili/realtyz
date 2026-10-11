import { useEffect, useState } from 'react';
import { BadgePercent } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

/** Partner-set discount (% or fixed ₪) for contacts they bring after the property's daily limit. */
export default function LeftoverDiscountButton({ referralId }: { referralId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase.from('affiliate_referrals').select('leftover_discount_type, leftover_discount_value').eq('id', referralId).maybeSingle()
      .then(({ data }) => {
        const d = data as { leftover_discount_type?: string; leftover_discount_value?: number } | null;
        setType(d?.leftover_discount_type === 'fixed' ? 'fixed' : 'percent');
        setValue(d?.leftover_discount_value ? String(d.leftover_discount_value) : '');
      });
  }, [open, referralId]);

  const save = async () => {
    const v = Number(value || 0);
    if (!Number.isFinite(v) || v < 0 || (type === 'percent' && v > 100)) { toast.error('ערך הנחה לא תקין'); return; }
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)('set_referral_leftover_discount', { _referral_id: referralId, _type: type, _value: v });
    setSaving(false);
    if (error || !data?.ok) { toast.error('השמירה נכשלה'); return; }
    toast.success('ההנחה נשמרה');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="הנחה ללידים מעבר למכסה">
          <BadgePercent className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-64 space-y-3">
        <p className="text-sm font-semibold">הנחה ללידים מעבר למכסה היומית</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['percent', 'fixed'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`rounded-md py-1 text-sm ${type === t ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>
              {t === 'percent' ? 'אחוז %' : 'סכום ₪'}
            </button>
          ))}
        </div>
        <Input inputMode="decimal" value={value} placeholder="0" onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
        <Button className="w-full" size="sm" disabled={saving} onClick={save}>שמירה</Button>
      </PopoverContent>
    </Popover>
  );
}
