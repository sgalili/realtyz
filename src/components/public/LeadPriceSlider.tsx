import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { LeadPopularityNote } from './LeadPopularityNote';
import { LEAD_PRICE_RANGES, type LeadPriceKey } from '@/lib/leadPriceRanges';
import { thresholdOffer, offerScale } from '@/lib/offerThreshold';

export function LeadPriceSlider({ tier, label, value, onChange, unrestricted = false, display = 'all', range: rangeOverride, hidePotential = false, exactBounds = false, dynamicFeedback = false }: {
  tier: LeadPriceKey; label: string; value: string; onChange: (value: string) => void; unrestricted?: boolean; display?: 'all' | 'price' | 'slider'; range?: { min: number; max: number }; hidePotential?: boolean; exactBounds?: boolean; dynamicFeedback?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const range = rangeOverride && rangeOverride.max >= rangeOverride.min ? rangeOverride : LEAD_PRICE_RANGES[tier];
  const scale = offerScale(range.min, range.max, 1);
  // Offers start at 0; the tier minimum is never auto-applied.
  const clamp = (next: number) => Math.min(range.max, Math.max(0, Number.isFinite(next) ? next : 0));
  const amount = unrestricted ? Math.max(0, Number(value) || 0) : clamp(Number(value));
  const progress = Math.max(0, Math.min(1, (amount - range.min) / Math.max(1, range.max - range.min)));
  const save = () => { const parsed = Number(draft); if (Number.isFinite(parsed) && parsed >= 0) onChange(String(unrestricted ? parsed : thresholdOffer(parsed, range.min, range.max))); setEditing(false); };
  return <div className="closing-fee space-y-2" data-level={Math.min(3, Math.floor(progress * 4))}>
    {display !== 'slider' && <div className="flex h-9 items-center justify-center gap-2">
      {editing ? <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); save(); }}>
        <Input autoFocus type="number" min={0} max={unrestricted ? undefined : range.max} step="any" aria-label={`עמלה עבור ${label}`} className="h-8 w-24" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label={`שמירת עמלה עבור ${label}`} title="שמירה"><Check className="h-4 w-4" /></Button>
      </form> : <Button type="button" variant="ghost" className={"h-10 px-2 text-[24px] font-bold closing-tone"} aria-label={`עריכת עמלה עבור ${label}`} title="עריכת עמלה" onClick={() => { setDraft(String(amount)); setEditing(true); }}><bdi>₪{amount}</bdi></Button>}
    </div>}
    {display !== 'price' && <><Slider className="closing-slider h-6" dir="ltr" aria-label={`סליידר עמלה עבור ${label}`} aria-valuetext={`${amount} ₪`} disabled={exactBounds && range.min === range.max} min={exactBounds ? range.min : 0} max={exactBounds ? range.max : scale.max} step={1} value={[exactBounds ? Math.max(range.min, amount) : scale.position(amount)]} onValueChange={values => { const next = values[0]; if (next !== undefined) { setAdjusting(true); onChange(String(exactBounds ? next : scale.amount(next))); } }} onValueCommit={() => setAdjusting(false)} onKeyUp={() => setAdjusting(false)} onBlur={() => setAdjusting(false)} />
    <div className="flex items-start justify-between gap-1 text-xs text-muted-foreground" dir="ltr"><span>₪{hidePotential ? range.min.toLocaleString('he-IL') : 0}</span><span>₪{range.max.toLocaleString('he-IL')}</span></div>{!hidePotential && (dynamicFeedback ? <div className="min-h-10 text-center text-xs leading-relaxed text-muted-foreground" aria-live="polite">{adjusting && `בהצעה של ₪${amount}: ${['העלאת הסכום עשויה לעורר יותר עניין ושיתוף מצד השותפים.', 'תמריץ גבוה יותר עשוי להגדיל את הביקוש והחשיפה בקרב השותפים.', 'המשך העלאת הסכום כדי לעודד חשיפה ושיתוף רחבים יותר.', 'זהו התמריץ המרבי בטווח לעידוד חשיפה ושיתוף; אין התחייבות לתוצאות.'][Math.min(3, Math.floor(progress * 4))]}`}</div> : <LeadPopularityNote />)}</>}
  </div>;
}
