import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { clampLeadPrice, LEAD_PRICE_RANGES, type LeadPriceKey } from '@/lib/leadPriceRanges';

export function LeadPriceSlider({ tier, label, value, onChange }: {
  tier: LeadPriceKey; label: string; value: string; onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const enabled = Number(value) > 0;
  const amount = clampLeadPrice(tier, Number(value));
  const range = LEAD_PRICE_RANGES[tier];
  const save = () => { onChange(String(clampLeadPrice(tier, Number(draft)))); setEditing(false); };
  return <div className="space-y-2">
    <div className="flex h-9 items-center justify-between gap-2">
      <Switch aria-label={`הפעלת עמלה עבור ${label}`} checked={enabled} onCheckedChange={active => { onChange(active ? String(range.min) : ''); setEditing(false); }} />
      {editing ? <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); save(); }}>
        <Input autoFocus type="number" min={range.min} max={range.max} step="any" aria-label={`עמלה עבור ${label}`} className="h-8 w-24" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label={`שמירת עמלה עבור ${label}`} title="שמירה"><Check className="h-4 w-4" /></Button>
      </form> : <Button type="button" variant="ghost" className="h-8 px-2 text-lg font-bold text-primary" aria-label={`עריכת עמלה עבור ${label}`} title="עריכת עמלה" onClick={() => { setDraft(String(amount)); setEditing(true); }}>{enabled ? <bdi>₪{amount}</bdi> : 'ללא עמלה'}</Button>}
    </div>
    <Slider dir="ltr" aria-label={`סליידר עמלה עבור ${label}`} min={range.min} max={range.max} step={1} value={[amount]} onValueChange={values => { const next = values[0]; if (next !== undefined) onChange(String(next)); }} />
    <div className="flex justify-between text-xs text-muted-foreground" dir="ltr"><span>₪{range.min}</span><span>₪{range.max}</span></div>
  </div>;
}