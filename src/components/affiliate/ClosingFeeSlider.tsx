import { useState } from 'react';
import { ChevronDown, CircleHelp, Trophy, Users, Zap } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clampClosingPercent, closingFeeAmount, closingFeeRange } from '@/lib/closingFee';
import { ClosingSplitNote } from './ClosingSplitNote';
import { BrokerTestLinks } from './BrokerClosingInfo';
import { fmtILS } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { PricingCardHeader } from '@/components/public/PricingCardHeader';
import { CollapsedOffer } from '@/components/public/CollapsedOffer';
import { thresholdOffer, offerScale } from '@/lib/offerThreshold';

export function ClosingFeeSlider({ dealType, price, value, valueType = 'percent', onChange, dualMode = false, onValueChange, className, open: openProp, onOpenChange, unrestricted = false, zeroMin = false, publisherCard = false }: {
  className?: string;
  dealType: string | null | undefined;
  price: number;
  value: number;
  valueType?: 'fixed' | 'percent';

  onChange: (percent: number) => void;
  dualMode?: boolean;
  onValueChange?: (value: number, mode: 'fixed' | 'percent') => void;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  unrestricted?: boolean;
  /** Publisher offers start at 0; the tier minimum is never auto-applied. */
  zeroMin?: boolean;
  publisherCard?: boolean;
}) {
  const range = closingFeeRange(dealType, price);
  // Rentals are always priced in ₪, sales always in % (0.2%-2%).
  const outType: 'fixed' | 'percent' = dualMode ? (range.rent ? 'fixed' : 'percent') : valueType;
  const rawPercent = valueType === 'fixed' && price > 0 ? value / price * 100 : valueType === 'percent' ? value : zeroMin ? 0 : range.min;
  const clampPercent = (next: number) => zeroMin ? Math.min(range.max, Math.max(0, next)) : unrestricted ? Math.max(0, next) : clampClosingPercent(next, dealType);
  const percent = publisherCard && value === 0 ? 0 : clampPercent(rawPercent);

  const progress = Math.max(0, Math.min(1, (percent - range.min) / (range.max - range.min)));
  const level = Math.min(3, Math.floor(progress * 4));
  const [editing, setEditing] = useState(false);
  const [editingPercent, setEditingPercent] = useState(false);
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(resolved); else setInternalOpen(resolved);
  };
  const [draft, setDraft] = useState('');
  const amount = closingFeeAmount(percent, range.price);
  const displayAmount = range.price > 0;
  const amountScale = dualMode && outType === 'fixed';
  const minimum = zeroMin ? 0 : amountScale ? range.price * range.min / 100 : range.min;

  const scale = offerScale(range.min, range.max, range.step);
  const maximum = amountScale ? range.price * range.max / 100 : range.max;
  const exactAmount = range.price * percent / 100;
  const money = (n: number) => fmtILS(Math.round(n));
  const selectedLabel = money(exactAmount);
  const percentageLabel = `(${Number(percent.toFixed(2))}%)`;
  const changePercent = (next: number) => {
    if (dualMode && onValueChange) onValueChange(outType === 'fixed' ? Math.round(range.price * next / 100) : next, outType);
    else onChange(next);
  };
  const commit = () => {
    const parsed = Number(draft.replace(/,/g, ''));
    if (draft.trim() && Number.isFinite(parsed) && parsed >= 0) {
      const next = !editingPercent && displayAmount && range.price > 0 ? parsed / range.price * 100 : parsed;
      changePercent(zeroMin && !unrestricted ? thresholdOffer(next, range.min, range.max) : clampPercent(next));
    }
    setEditing(false);
    setEditingPercent(false);
  };
  const priceControl = editing && !editingPercent ? <Input autoFocus aria-label="עריכת עמלת סגירה" inputMode="decimal" dir="ltr" className="h-8 w-24 text-center text-xl font-bold" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditing(false); }} /> : <Button type="button" variant="ghost" className={cn("h-9 px-0 text-[24px] font-bold", publisherCard && value === 0 ? 'text-destructive' : 'closing-tone')} aria-label="עריכת עמלת סגירה" onClick={() => { setDraft(String(displayAmount ? (dualMode ? exactAmount : amount) : percent)); setEditing(true); }}>{selectedLabel}</Button>;
  return <section className={cn("closing-fee", publisherCard ? "space-y-2" : "space-y-4 pt-4", className)} data-level={level}>
    {publisherCard ? <PricingCardHeader
      icon={<Trophy className={cn("!h-[29.3px] !w-[29.3px] shrink-0", value > 0 ? 'closing-tone' : 'pricing-icon-disabled')} strokeWidth={1} />}
      price={open ? null : <CollapsedOffer required active={value > 0} amount={`${selectedLabel} ${percentageLabel}`} label="עריכת עמלת סגירה" onClick={() => setOpen(true)} />}
      title={<Button type="button" variant="ghost" className="h-auto min-w-0 whitespace-normal p-0 text-start text-base font-bold leading-snug hover:bg-transparent" aria-expanded={open} onClick={() => setOpen(!open)}><span><span className="text-destructive">* </span>עמלת תיווך עבור סגירת עסקה</span></Button>}
      help={<Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 p-0" aria-label="הסבר עמלת סגירת עסקה"><CircleHelp className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent dir="rtl" align="end" className="w-80"><div className="space-y-2"><p className="text-sm font-semibold">כך מתחלקת עמלת הסגירה</p><ClosingSplitNote gross={displayAmount ? (dualMode ? exactAmount : amount) : percent} valueType={displayAmount ? 'fixed' : 'percent'} registration /><p className="text-xs leading-relaxed text-muted-foreground">התגמול משולם רק לאחר סגירת העסקה בפועל, ורק למתווכים/שותפים בעלי רישיון תיווך מאומת. אין התחייבות לסגירה.</p><BrokerTestLinks /></div></PopoverContent></Popover>}
      controls={<><Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 p-0 text-muted-foreground" aria-label={open ? 'כווץ את עמלת התיווך' : 'הרחב את עמלת התיווך'} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown className={cn('h-6 w-6 transition-transform motion-reduce:transition-none', open && 'rotate-180')} /></Button></>}
    /> : <>
    <div className="flex items-center gap-2 text-sm font-semibold"><Button type="button" variant="ghost" className="h-9 gap-2 px-0 font-semibold" aria-expanded={open} aria-controls={open ? 'closing-fee-body' : undefined} onClick={() => setOpen((next) => !next)}><Trophy className="h-[27px] w-[27px] closing-tone" />עמלת תיווך עבור סגירת עסקה *</Button><Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 p-0" aria-label="הסבר עמלת סגירת עסקה"><CircleHelp className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent dir="rtl" align="end" className="w-80"><div className="space-y-2"><p className="text-sm font-semibold">כך מתחלקת עמלת הסגירה</p><ClosingSplitNote gross={displayAmount ? (dualMode ? exactAmount : amount) : percent} valueType={displayAmount ? 'fixed' : 'percent'} registration /><p className="text-xs leading-relaxed text-muted-foreground">התגמול משולם רק לאחר סגירת העסקה בפועל, ורק למתווכים/שותפים בעלי רישיון תיווך מאומת. אין התחייבות לסגירה.</p><BrokerTestLinks /></div></PopoverContent></Popover><span className="ms-auto flex items-center gap-2">{!open && <Button type="button" variant="ghost" className="h-9 px-2 text-lg font-bold closing-tone" aria-label="עריכת עמלת סגירה" onClick={() => { setDraft(String(displayAmount ? (dualMode ? exactAmount : amount) : percent)); setEditing(true); setOpen(true); }}>{selectedLabel}</Button>}<Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 p-0 text-muted-foreground" aria-label={open ? 'כווץ את עמלת התיווך' : 'הרחב את עמלת התיווך'} aria-expanded={open} aria-controls={open ? 'closing-fee-body' : undefined} onClick={() => setOpen((next) => !next)}><ChevronDown className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></Button></span></div>
    </>}
    {open && <div id="closing-fee-body" className={publisherCard ? "space-y-2" : "space-y-4"}><div className="text-center">
      {!publisherCard && <div className="flex h-14 items-center justify-center" dir="ltr">
        {editing ? <Input autoFocus aria-label="עריכת עמלת סגירה" inputMode="decimal" dir="ltr" className="h-12 w-44 text-center text-3xl font-bold" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditing(false); }} /> :
          <Button type="button" variant="ghost" className="h-14 px-3 text-[42px] font-bold closing-tone" aria-label="עריכת עמלת סגירה" onClick={() => { setDraft(String(exactAmount)); setEditing(true); }}>{selectedLabel}</Button>}
      </div>}
      {!publisherCard && !displayAmount && <p className="text-xs text-muted-foreground">מחיר הנכס טרם הוזן</p>}
    </div>
    <div dir="ltr" className={cn("space-y-2", !publisherCard && "px-2")}>
      {publisherCard && <div className="flex h-9 items-center justify-center gap-2">{priceControl}{displayAmount && <>{editing && editingPercent ? <Input autoFocus aria-label="עריכת אחוז עמלת סגירה" inputMode="decimal" dir="ltr" className="h-8 w-20 text-center text-[13px]" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setEditing(false); setEditingPercent(false); } }} /> : <Button type="button" variant="ghost" aria-label="עריכת אחוז עמלת סגירה" className="h-8 px-1 text-[13px] font-normal text-muted-foreground" onClick={() => { setDraft(String(Number(percent.toFixed(2)))); setEditingPercent(true); setEditing(true); }}>{percentageLabel}</Button>}</>}</div>}
      {!publisherCard && !range.rent && displayAmount && <p className="text-center text-xs text-muted-foreground">({Number(percent.toFixed(2))}%)</p>}
      <Slider dir="ltr" aria-label="עמלת סגירה" aria-valuetext={selectedLabel} min={zeroMin ? 0 : minimum} max={zeroMin ? scale.max : maximum} disabled={!displayAmount} step={zeroMin ? 1 : amountScale ? 0.01 : range.step} value={[zeroMin ? scale.position(percent) : amountScale ? exactAmount : percent]} onValueChange={values => { const next = values[0]; if (next !== undefined) changePercent(zeroMin ? scale.amount(next) : amountScale && range.price > 0 ? next / range.price * 100 : next); }} className="closing-slider h-6" />
      <div className="relative flex items-center justify-between text-xs tabular-nums text-muted-foreground"><span>{money(closingFeeAmount(zeroMin ? 0 : range.min, range.price))}</span><span>{money(closingFeeAmount(range.max, range.price))}</span><p dir="rtl" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap closing-tone"><Zap className="h-3.5 w-3.5" />{['תחילת הדרך', 'יותר תמריץ לשותפים', 'פוטנציאל חשיפה מוגבר', 'תמריץ מרבי לרשת השותפים'][level]}</p></div>
    </div>
    <div className="space-y-2 text-center">
      <p className="text-sm font-semibold" aria-live="polite">פוטנציאל שיתוף: כ־{1 + Math.round(progress * 99)} שותפים</p>
      <div className="flex h-8 flex-row-reverse items-center justify-center gap-2 closing-tone" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <Users key={index} className={`h-6 w-6 transition-all duration-300 motion-reduce:transition-none ${index < 1 + Math.round(progress * 5) ? 'scale-100 opacity-100' : 'scale-75 opacity-20'}`} />)}</div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">*ההפצה תלויה בשותפים ובקבוצות הזמינות; אין התחייבות לכמות פרסומים או לסגירה.</p>
    </div>
    </div>}
  </section>;
}