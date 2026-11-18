import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ImportQuantityInput({ id, value, min, max, onChange }: {
  id: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const update = (next: number) => {
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
  };
  return <div className="flex h-11 items-center gap-1 rounded-md border border-input bg-background px-1" dir="ltr">
    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={value <= min} aria-label="הקטנת כמות" title="הקטנת כמות" onClick={() => update(value - 1)}><ChevronDown className="h-4 w-4" /></Button>
    <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={event => update(Number(event.target.value))} className="h-9 min-w-0 border-0 text-center text-base shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={value >= max} aria-label="הגדלת כמות" title="הגדלת כמות" onClick={() => update(value + 1)}><ChevronUp className="h-4 w-4" /></Button>
  </div>;
}