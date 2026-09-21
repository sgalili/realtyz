// Filter button that lives inside a search field, opposite the magnifier.
// Filters properties by the lead types they pay for and by the lead value.
import { ClipboardList, Phone, SlidersHorizontal, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import {
  EMPTY_LEAD_FILTER,
  LEAD_TYPE_LABELS,
  LEAD_TYPE_ORDER,
  leadFilterActiveCount,
  type LeadFilterState,
  type LeadTypeKey,
} from '@/lib/leadTypeFilter';

const ICONS: Record<LeadTypeKey, typeof ClipboardList> = {
  tier1: ClipboardList,
  tier2: WhatsAppIcon as typeof ClipboardList,
  tier3: Phone,
  tier4: Trophy,
};

export default function LeadTypeFilterButton({
  state,
  onChange,
  className = '',
}: {
  state: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
  /** Positioning inside the search field is left to the caller. */
  className?: string;
}) {
  const active = leadFilterActiveCount(state);

  const toggle = (key: LeadTypeKey) => {
    const types = state.types.includes(key)
      ? state.types.filter((value) => value !== key)
      : [...state.types, key];
    onChange({ ...state, types });
  };

  const setBound = (field: 'min' | 'max', raw: string) => {
    const trimmed = raw.trim();
    onChange({ ...state, [field]: trimmed === '' ? null : Math.max(0, Number(trimmed) || 0) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="סינון לפי סוג ליד ושווי ליד"
          title="סינון לפי סוג ליד ושווי ליד"
          className={`grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${active ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''} ${className}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {active ? (
            <span className="absolute -top-1 start-0 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {active}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3" dir="rtl">
        <div className="text-sm font-semibold">סוג הליד</div>
        <div className="space-y-2">
          {LEAD_TYPE_ORDER.map((key) => {
            const Icon = ICONS[key];
            return (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                <Checkbox checked={state.types.includes(key)} onCheckedChange={() => toggle(key)} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {LEAD_TYPE_LABELS[key]}
              </label>
            );
          })}
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="text-sm font-semibold">שווי הליד (₪)</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">מ־</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                dir="ltr"
                className="h-9"
                value={state.min ?? ''}
                onChange={(event) => setBound('min', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">עד</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                dir="ltr"
                className="h-9"
                value={state.max ?? ''}
                onChange={(event) => setBound('max', event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-start">
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(EMPTY_LEAD_FILTER)} disabled={!active}>
            ניקוי סינון
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
