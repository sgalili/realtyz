import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Minus, Plus } from 'lucide-react';
import { useMandate } from '@/hooks/useMandate';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Minimal mandate selector for the dashboard header.
 * Layout (LTR): [+]  X מנדטים  [-]
 * - Plus on the left, Minus on the right (per spec)
 * - Buttons sit ~10px tighter against the centered label
 * - Tooltip is portaled with z-[100] so it floats above the navy hero
 */
export function MandateSelector() {
  const { selectedMandates, increment, decrement, min, max } = useMandate();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            dir="ltr"
            role="group"
            aria-label="בורר מנדטים"
            className="group inline-flex items-center gap-2 rounded-2xl border border-primary/15 bg-card px-4 py-2.5 shadow-md transition-shadow hover:shadow-lg"
          >
            {/* Left button - Minus (decrement) */}
            <button
              type="button"
              onClick={decrement}
              disabled={selectedMandates <= min}
              aria-label="הקטן יעד מנדטים"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Minus className="h-5 w-5" />
            </button>

            {/* Inline label - "יעד: X מנדטים" on a single line */}
            <div dir="rtl" className="flex items-baseline justify-center gap-2 px-3 leading-none">
              <span className="text-base font-semibold text-muted-foreground">
                יעד:
              </span>
              <span
                key={selectedMandates}
                className="inline-block min-w-[2.5ch] text-center animate-fade-in font-mono text-4xl font-bold tabular-nums text-primary"
              >
                {selectedMandates}
              </span>
              <span className="text-base font-semibold text-muted-foreground">
                מנדטים
              </span>
            </div>

            {/* Right button - Plus (increment) */}
            <button
              type="button"
              onClick={increment}
              disabled={selectedMandates >= max}
              aria-label="הגדל יעד מנדטים"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </TooltipTrigger>
        {/* Portal so the bubble floats above the navy hero (which has its own stacking context) */}
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            align="center"
            dir="rtl"
            sideOffset={8}
            className="z-[100] w-[300px] overflow-hidden rounded-lg border border-primary/20 bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
          >
            <div className="space-y-2.5 text-right">
              <p className="text-[18px] font-bold text-primary">בורר יעד מנדטים</p>
              <p className="text-[16px] leading-relaxed text-foreground">
                בחר את מספר המנדטים שאליהם אתה מכוון בקמפיין. המערכת תתאים אוטומטית את הקצב, התקציב והמכסות בכל המסכים.
              </p>
              <div className="rounded-md bg-success px-2.5 py-2 text-[15px] font-semibold leading-relaxed text-success-foreground">
                ✓ הכל כלול במחיר - לפי יעד המנדטים שבחרת. ללא תוספות נסתרות.
              </div>
            </div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );
}
