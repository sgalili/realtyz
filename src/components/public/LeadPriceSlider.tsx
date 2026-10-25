import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { PartnerPotential } from './PartnerPotential';
import { partnerPotential } from '@/lib/partnerPotential';
import { clampLeadPrice, LEAD_PRICE_RANGES, type LeadPriceKey } from '@/lib/leadPriceRanges';

export function LeadPriceSlider({ tier, label, value, onChange }: {
  tier: LeadPriceKey; label: string; value: string; onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const amount = clampLeadPrice(tier, Number(value));
  const range = LEAD_PRICE_RANGES[tier];
  const progress = (amount - range.min) / (range.max - range.min);
  const save = () => { onChange(String(clampLeadPrice(tier, Number(draft)))); setEditing(false); };
  return <div className="closing-fee space-y-2" data-level={partnerPotential(progress).level}>
    <div className="flex h-11 items-center justify-center gap-2">
      {editing ? <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); save(); }}>
        <Input autoFocus type="number" min={range.min} max={range.max} step="any" aria-label={`עמלה עבור ${label}`} className="h-8 w-24" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label={`שמירת עמלה עבור ${label}`} title="שמירה"><Check className="h-4 w-4" /></Button>
      </form> : <Button type="button" variant="ghost" className={"h-10 px-2 text-[24px] font-bold closing-tone"} aria-label={`עריכת עמלה עבור ${label}`} title="עריכת עמלה" onClick={() => { setDraft(String(amount)); setEditing(true); }}><bdi>₪{amount}</bdi></Button>}
    </div>
    <Slider className="closing-slider h-6" dir="ltr" aria-label={`סליידר עמלה עבור ${label}`} min={range.min} max={range.max} step={1} value={[amount]} onValueChange={values => { const next = values[0]; if (next !== undefined) onChange(String(next)); }} />
    <div className="flex items-start justify-between gap-1 text-xs text-muted-foreground" dir="ltr"><span>₪{range.min}</span><PartnerPotential progress={progress} /><span>₪{range.max}</span></div>
  </div>;
}