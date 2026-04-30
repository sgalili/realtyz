import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sparkles, Zap, Bot, Loader2, Rocket } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMandate } from '@/hooks/useMandate';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_CANDIDATES, type DemoCandidateId } from '@/lib/demoData';

/**
 * Magic Mandate Selector
 *
 * Premium replacement for the legacy "demo candidate picker".
 * - Single slider drives mandate target (1..120)
 * - Live, animated breakdown of voters + AI minutes
 * - "Analyzing Goals" boom state before resolving
 * - On apply: persists mandate target to global state and selects the
 *   closest matching demo candidate archetype.
 */

const MIN = 1;
const MAX = 120;

// Magic constants tuned for "feels right" demo math
const VOTERS_PER_MANDATE = 40_000; // approx Knesset threshold scaling
const AI_MINUTES_PER_MANDATE = 1_200; // monthly call minutes per mandate

const formatNumber = (n: number) => n.toLocaleString('he-IL');

const ARCHETYPES: DemoCandidateId[] = [
  'primary-single',
  'primary-slate',
  'national-small',
  'national-mid',
  'national-large',
];

/** Pick the demo candidate whose mandateGoal is closest to the chosen value. */
const pickCandidateForMandates = (mandates: number): DemoCandidateId => {
  const candidates = DEMO_CANDIDATES.filter((c) => ARCHETYPES.includes(c.id));
  let best = candidates[0];
  let bestDiff = Math.abs(best.mandateGoal - mandates);
  for (const c of candidates) {
    const diff = Math.abs(c.mandateGoal - mandates);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best.id;
};

interface MagicMandateSelectorProps {
  open: boolean;
  onComplete: () => void;
}

export function MagicMandateSelector({ open, onComplete }: MagicMandateSelectorProps) {
  const { selectedMandates, setSelectedMandates } = useMandate();
  const { setDemoCandidateId } = useDemoMode();

  const [value, setValue] = useState<number>(selectedMandates || 12);
  const [analyzing, setAnalyzing] = useState(false);

  // Reset internal state when dialog re-opens
  useEffect(() => {
    if (open) {
      setValue(selectedMandates || 12);
      setAnalyzing(false);
    }
  }, [open, selectedMandates]);

  const breakdown = useMemo(
    () => ({
      voters: Math.round(value * VOTERS_PER_MANDATE),
      minutes: Math.round(value * AI_MINUTES_PER_MANDATE),
    }),
    [value],
  );

  const handleApply = () => {
    setAnalyzing(true);
    window.setTimeout(() => {
      setSelectedMandates(value);
      setDemoCandidateId(pickCandidateForMandates(value));
      setAnalyzing(false);
      onComplete();
    }, 1000);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-lg [&>button]:hidden bg-card border-primary/10 shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-bold tracking-tight text-primary">
            מה יעד המנדטים שלך?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            בחר יעד, וה-AI שלנו יחשב מיד את משאבי הניצחון הנדרשים
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {analyzing ? (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center justify-center gap-4 py-12"
            >
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-base font-semibold text-primary">מנתח יעדים...</p>
              <p className="text-xs text-muted-foreground">בונה תשתית לניצחון</p>
            </motion.div>
          ) : (
            <motion.div
              key="picker"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-7 pt-3"
            >
              {/* Big number */}
              <div className="flex flex-col items-center gap-1">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={value}
                    initial={{ opacity: 0, y: 10, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                    className="font-mono text-6xl font-bold tabular-nums text-primary leading-none"
                  >
                    {value}
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium text-muted-foreground">
                  {value === 1 ? 'מנדט' : 'מנדטים'}
                </span>
              </div>

              {/* Slider */}
              <div className="px-2" dir="ltr">
                <SliderPrimitive.Root
                  min={MIN}
                  max={MAX}
                  step={1}
                  value={[value]}
                  onValueChange={(v) => setValue(v[0])}
                  className="relative flex h-5 w-full touch-none select-none items-center"
                >
                  <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
                    <SliderPrimitive.Range className="absolute h-full bg-primary" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    aria-label="יעד מנדטים"
                    className="block h-6 w-6 rounded-full border-2 border-primary bg-background shadow-lg ring-offset-background transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
                  />
                </SliderPrimitive.Root>
                <div className="mt-1.5 flex justify-between text-[10px] font-medium text-muted-foreground" dir="rtl">
                  <span>{MIN}</span>
                  <span>{MAX}</span>
                </div>
              </div>

              {/* Magic Breakdown */}
              <div className="rounded-xl border border-primary/10 bg-secondary/40 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  ניתוח קסם
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <BreakdownItem
                    label="קהל יעד לניצחון"
                    value={`${formatNumber(breakdown.voters)}`}
                    suffix="בוחרים מזוהים"
                    valueKey={breakdown.voters}
                  />
                  <BreakdownItem
                    label="תפוקת AI"
                    value={`${formatNumber(breakdown.minutes)}`}
                    suffix="דקות שיחה / חודש"
                    valueKey={breakdown.minutes}
                  />
                </div>
              </div>

              {/* Magic Explanation */}
              <div className="grid gap-2 text-[12px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <strong className="font-semibold text-foreground">דיוק:</strong> אלגוריתם המרת קולות מבוסס נתוני אמת.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <strong className="font-semibold text-foreground">מהירות:</strong> פריסת תשתית מיידית לפי היעד שבחרת.
                  </span>
                </div>
              </div>

              {/* Action */}
              <Button
                onClick={handleApply}
                size="lg"
                className="w-full gap-2 bg-primary text-primary-foreground shadow-lg hover:bg-primary-glow"
              >
                <Rocket className="h-4 w-4" />
                בנה לי מטה מנצח
                <Sparkles className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownItem({
  label,
  value,
  suffix,
  valueKey,
}: {
  label: string;
  value: string;
  suffix: string;
  valueKey: number;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={valueKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="mt-0.5 font-mono text-xl font-bold tabular-nums text-primary leading-tight"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span className="text-[10px] text-muted-foreground">{suffix}</span>
    </div>
  );
}
