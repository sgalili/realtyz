import { useState } from 'react';
import { Trophy, Users, Zap } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clampClosingPercent, closingFeeAmount, closingFeeRange } from '@/lib/closingFee';
import { ClosingSplitNote } from './ClosingSplitNote';

export function ClosingFeeSlider({ dealType, price, value, valueType = 'percent', onChange, dualMode = false, onValueChange }: {
  dealType: string | null | undefined;
  price: number;
  value: number;
  valueType?: 'fixed' | 'percent';
  onChange: (percent: number) => void;
  dualMode?: boolean;
  onValueChange?: (value: number, mode: 'fixed' | 'percent') => void;
}) {
  const range = closingFeeRange(dealType, price);
  const percent = clampClosingPercent(valueType === 'fixed' && price > 0 ? value / price * 100 : valueType === 'percent' ? value : range.min, dealType);
  const progress = (percent - range.min) / (range.max - range.min);
  const level = Math.min(3, Math.floor(progress * 4));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const amount = closingFeeAmount(percent, range.price);
  const displayAmount = dualMode ? valueType === 'fixed' : range.rent && range.price > 0;
  const minimum = displayAmount && dualMode ? range.price * range.min / 100 : range.min;
  const maximum = displayAmount && dualMode ? range.price * range.max / 100 : range.max;
  const exactAmount = range.price * percent / 100;
  const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
  const changePercent = (next: number) => {
    if (dualMode && onValueChange) onValueChange(displayAmount ? range.price * next / 100 : next, valueType);
    else onChange(next);
  };
  const commit = () => {
    const parsed = Number(draft.replace(/,/g, ''));
    if (draft.trim() && Number.isFinite(parsed)) changePercent(clampClosingPercent(displayAmount && range.price > 0 ? parsed / range.price * 100 : parsed, dealType));
    setEditing(false);
  };
  return <section className="closing-fee space-y-4 pt-4" data-level={level}>
    <div className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 closing-tone" />סגירת עסקה *</div>
    <div className="text-center">
      <div className="flex h-14 items-center justify-center" dir="ltr">
        {editing ? <Input autoFocus aria-label="עריכת עמלת סגירה" inputMode="decimal" dir="ltr" className="h-12 w-44 text-center text-3xl font-bold" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditing(false); }} /> :
          <Button type="button" variant="ghost" className="h-14 px-3 text-4xl font-bold closing-tone" aria-label="עריכת עמלת סגירה" onClick={() => { setDraft(String(displayAmount ? (dualMode ? exactAmount : amount) : percent)); setEditing(true); }}>{displayAmount ? money(dualMode ? exactAmount : amount) : `${Number(percent.toFixed(2))}%`}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{dualMode ? (range.price > 0 ? (displayAmount ? `${Number(percent.toFixed(2))}%` : money(exactAmount)) : 'מחיר הנכס טרם הוזן') : range.rent ? (range.price > 0 ? `${Number(percent.toFixed(2))}% משכר הדירה החודשי` : 'משכר הדירה החודשי') : `ממחיר המכירה${range.price > 0 ? ` · ₪${amount.toLocaleString('he-IL')}` : ''}`}</p>
    </div>
    <div dir="ltr" className="space-y-2 px-2">
      <Slider dir="ltr" aria-label="עמלת סגירה" min={minimum} max={maximum} disabled={dualMode && displayAmount && range.price <= 0} step={dualMode && displayAmount ? 0.01 : range.step} value={[dualMode && displayAmount ? exactAmount : percent]} onValueChange={values => { const next = values[0]; if (next !== undefined) changePercent(dualMode && displayAmount && range.price > 0 ? next / range.price * 100 : next); }} className="closing-slider h-6" />
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{displayAmount ? money(dualMode ? minimum : closingFeeAmount(range.min, range.price)) : `${range.min}%`}</span><span>{displayAmount ? money(dualMode ? maximum : closingFeeAmount(range.max, range.price)) : `${range.max}%`}</span></div>
    </div>
    <div className="space-y-2 text-center">
      <div className="flex h-8 flex-row-reverse items-center justify-center gap-2 closing-tone" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <Users key={index} className={`h-6 w-6 transition-all duration-300 motion-reduce:transition-none ${index < 1 + Math.round(progress * 5) ? 'scale-100 opacity-100' : 'scale-75 opacity-20'}`} />)}</div>
      <p className="text-sm font-semibold" aria-live="polite">פוטנציאל שיתוף: כ־{1 + Math.round(progress * 99)} שותפים</p>
      <p className="flex items-center justify-center gap-1 text-xs closing-tone"><Zap className="h-3.5 w-3.5" />{['תחילת הדרך', 'יותר תמריץ לשותפים', 'פוטנציאל חשיפה מוגבר', 'תמריץ מרבי לרשת השותפים'][level]}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">*ההפצה תלויה בשותפים ובקבוצות הזמינות; אין התחייבות לכמות פרסומים או לסגירה.</p>
    </div>
    <ClosingSplitNote gross={displayAmount ? (dualMode ? exactAmount : amount) : percent} valueType={displayAmount ? 'fixed' : 'percent'} />
  </section>;
}