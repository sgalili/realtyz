import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, TrendingUp, Users, Mic, MessageSquare, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMandate } from '@/hooks/useMandate';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useElectionType } from '@/hooks/useElectionType';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { aiVoiceQuota, voterPool, monthlyPackagePrice } from '@/lib/quotaCalculator';
import { logUpgradeInterest } from '@/lib/upgradeLeads';
import { UpgradePlanModal } from './UpgradePlanModal';
import { ElectionTypeSwitcher } from '@/components/ElectionTypeSwitcher';

/**
 * Strategic Growth Slider — the dashboard-only "turn up the volume" upsell tool.
 *
 * Demo mode: changes propagate instantly via useMandate().
 * Real mode: acts as a "What If" simulator. The user's true plan target is
 * read from user_subscriptions; moving the slider only updates a local
 * preview. Pressing "Apply" with a higher value opens the Upgrade modal.
 *
 * Primaries adaptation: copy switches to "מושבים" (seats) and projection uses
 * 2,500 voters per seat (spec). National mode keeps mandate copy and the
 * standard quota math.
 */

const VOTERS_PER_SEAT_PRIMARIES = 2_500;
const NATIONAL_VOTES_PER_MANDATE = 38_000; // mirrors VOTES_PER_MANDATE
const MESSAGES_PER_MANDATE_NATIONAL = 50_000; // WhatsApp/SMS monthly quota per transaction
const MESSAGES_PER_SEAT_PRIMARIES = 3_500;   // WhatsApp/SMS monthly quota per seat

// Real-estate conversion benchmark: how many active prospects in the pipeline
// are typically required to close one deal. Used for the "Pipeline Health"
// indicator on the dashboard target card.
const ACTIVE_PROSPECTS_PER_DEAL = 70;
// Lead stages that are considered closed/lost — excluded from the active
// pipeline count.
const CLOSED_STAGES = ['closed', 'won', 'lost', 'converted'];

function formatNumber(n: number): string {
  return new Intl.NumberFormat('he-IL').format(Math.max(0, Math.round(n)));
}

export function StrategicGrowthSlider() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { type: electionType, terms } = useElectionType();
  const { selectedMandates, setSelectedMandates, increment, decrement, min, max } = useMandate();

  const isPrimaries = electionType === 'primaries';
  const unitLabel = terms.seat;
  const unitsLabel = terms.seats;
  const audienceLabel = isPrimaries ? terms.voters + ' מזוהים' : terms.voters;

  // Real user's locked-in plan target (only fetched when not in demo).
  const { data: planTarget } = useQuery({
    queryKey: ['growth-slider-plan-target', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('mandate_target')
        .eq('user_id', user!.id)
        .maybeSingle();
      return Math.max(min, data?.mandate_target ?? selectedMandates);
    },
  });


  // Live count of "active prospects" — leads currently in the pipeline (not
  // closed/won/lost). In demo mode we skip the query and synthesise a number
  // from the selected target so the gauge feels alive.
  const { data: activeProspectsLive = 0 } = useQuery({
    queryKey: ['active-prospects-count', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .not('lead_stage', 'in', `(${CLOSED_STAGES.join(',')})`);
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const currentPlan = planTarget ?? selectedMandates;
  const projected = selectedMandates;

  // Per-unit reach math (national vs primaries).
  const reachFor = (units: number): number => {
    if (isPrimaries) return units * VOTERS_PER_SEAT_PRIMARIES;
    // National: prefer the official quota voterPool() bracketing where possible,
    // but for delta-clarity also expose votes-per-transaction.
    return units * NATIONAL_VOTES_PER_MANDATE;
  };
  const minutesFor = (units: number): number => aiVoiceQuota(units);
  const poolFor = (units: number): number => (isPrimaries ? reachFor(units) : voterPool(units));
  const messagesFor = (units: number): number =>
    units * (isPrimaries ? MESSAGES_PER_SEAT_PRIMARIES : MESSAGES_PER_MANDATE_NATIONAL);

  const projection = useMemo(() => {
    const extraUnits = projected - currentPlan;
    return {
      extraUnits,
      extraReach: reachFor(projected) - reachFor(currentPlan),
      extraMinutes: minutesFor(projected) - minutesFor(currentPlan),
      currentReach: reachFor(currentPlan),
      projectedReach: reachFor(projected),
      currentMinutes: minutesFor(currentPlan),
      projectedMinutes: minutesFor(projected),
      currentPool: poolFor(currentPlan),
      projectedPool: poolFor(projected),
      currentMessages: messagesFor(currentPlan),
      projectedMessages: messagesFor(projected),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projected, currentPlan, isPrimaries]);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const lastLoggedDeltaRef = useRef<string>(''); // dedupe inserts per session per (current,attempted)


  // Auto-collapse the breakdown window (4 stat boxes + CTA) after 10s of no
  // interaction. The selector itself NEVER changes size.
  // Each click on +/- resets the timer. Long-press on the window pauses the
  // timer until release. Open/close uses a smooth rubber slide (no bounce).
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const startCollapse = () => {
    if (heldRef.current) return; // do not collapse while user is holding
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setClosing(true);
    // match slide-up duration (0.32s)
    closeTimerRef.current = window.setTimeout(() => {
      setExpanded(false);
      setClosing(false);
    }, 320);
  };
  const armIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (heldRef.current) return; // hold pauses the timer
    idleTimerRef.current = window.setTimeout(startCollapse, 10000);
  };
  const bumpExpanded = () => {
    if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setClosing(false);
    setExpanded(true);
    armIdleTimer();
  };
  const holdStart = () => {
    heldRef.current = true;
    if (idleTimerRef.current) { window.clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    if (closing) setClosing(false);
    if (!expanded) setExpanded(true);
  };
  const holdEnd = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    armIdleTimer();
  };
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const isUpgrade = !isDemoMode && projected > currentPlan;
  const isDowngrade = !isDemoMode && projected < currentPlan;
  // Uplift % over the user's current plan reach (audience). Used in modal copy.
  const upliftPercent = useMemo(() => {
    if (!currentPlan || projection.currentReach <= 0) return 0;
    return Math.round((projection.extraReach / projection.currentReach) * 100);
  }, [currentPlan, projection.currentReach, projection.extraReach]);

  const handleApply = async () => {
    if (isDemoMode) return; // demo: already live
    if (isUpgrade || isDowngrade) {
      setUpgradeOpen(true);
    }
    if (isUpgrade && user?.id) {
      const dedupeKey = `${currentPlan}->${projected}`;
      if (lastLoggedDeltaRef.current !== dedupeKey) {
        lastLoggedDeltaRef.current = dedupeKey;
        // Fire-and-forget; never block UI on lead capture.
        void logUpgradeInterest({
          userId: user.id,
          userEmail: user.email ?? null,
          currentTarget: currentPlan,
          attemptedTarget: projected,
          electionType,
        });
      }
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex w-full flex-col items-center gap-3">
        {isDemoMode && (
          <div className="flex w-full max-w-3xl justify-center">
            <ElectionTypeSwitcher size="sm" />
          </div>
        )}
        <div
          dir="rtl"
          className="kalpiz-growth-slider w-full max-w-3xl rounded-2xl border border-primary/10 bg-background px-5 pb-4 pt-3 shadow-md transition-shadow hover:shadow-lg"
          role="group"
          aria-label="בורר יעד אסטרטגי"
        >
        {/* === SELECTOR PANEL (silver, fixed size — never collapses) === */}
        <div
          className="kalpiz-growth-selector relative overflow-hidden rounded-xl border border-primary/15 px-5 py-4 shadow-sm"
          style={{
            background:
              'linear-gradient(180deg, hsl(210 27% 99%) 0%, hsl(var(--brand-silver)) 55%, hsl(214 20% 86%) 100%)',
          }}
        >
          {/* Stepper */}
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div
              className={`flex items-center gap-[5px] ${isUpgrade ? 'kalpiz-slider-upsell' : ''}`}
              data-upsell={isUpgrade ? 'true' : 'false'}
            >
              <button
                type="button"
                onClick={() => { bumpExpanded(); increment(); }}
                disabled={projected >= max}
                aria-label={`הגדל יעד ${unitsLabel}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-background/90 text-primary shadow-sm transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:shadow active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (expanded && !closing) {
                    if (idleTimerRef.current) { window.clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
                    startCollapse();
                  } else {
                    bumpExpanded();
                  }
                }}
                aria-expanded={expanded && !closing}
                aria-label={expanded && !closing ? 'כווץ פירוט יעד' : 'הרחב פירוט יעד'}
                className="flex items-baseline gap-2 leading-none rounded-lg px-2 py-1 transition-colors hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="text-[22px] font-bold text-primary/85" style={{ marginInlineStart: '10px' }}>יעד</span>
                <span
                  key={projected}
                  style={{ width: `${String(projected).length}ch` }}
                  className="inline-block text-center animate-fade-in font-mono text-[44px] font-bold tabular-nums text-primary drop-shadow-sm"
                >
                  {projected}
                </span>
                <span className="text-[20px] font-bold tracking-wide text-primary/75" style={{ marginInlineEnd: '10px' }}>
                  {unitsLabel}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { bumpExpanded(); decrement(); }}
                disabled={projected <= min}
                aria-label={`הקטן יעד ${unitsLabel}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-background/90 text-primary shadow-sm transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:shadow active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>
            </div>

            <p
              key={`req-${projected}`}
              className="animate-fade-in text-[13px] font-semibold tabular-nums text-primary/70"
            >
              דרושים ~<span className="font-bold text-primary">{formatNumber(reachFor(projected))}</span> {audienceLabel}
            </p>
          </div>
        </div>
        {/* === /SELECTOR PANEL === */}

        {/* Magic breakdown + CTA - shown after interaction; auto-collapses after 10s idle.
            Long-press anywhere on the window pauses the timer until release.
            Smooth rubber slide (no bounce), GPU-accelerated for 60fps. */}
        {(expanded || closing) && (
          <div
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerCancel={holdEnd}
            onPointerLeave={holdEnd}
            className={cn(
              'origin-top overflow-hidden will-change-[transform,opacity,max-height] [backface-visibility:hidden] [transform:translateZ(0)]',
              closing ? 'animate-slide-up-smooth' : 'animate-slide-down-smooth',
            )}
          >
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                icon={<Users className="h-3.5 w-3.5" />}
                label={audienceLabel}
                value={formatNumber(projection.projectedReach)}
                delta={projection.extraReach}
                tone={projection.extraReach >= 0 ? 'gold' : 'muted'}
              />
              <Stat
                icon={<Mic className="h-3.5 w-3.5" />}
                label="דקות AI Voice"
                value={formatNumber(projection.projectedMinutes)}
                delta={projection.extraMinutes}
                tone="gold"
              />
              <Stat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label={`מאגר ${terms.voters}`}
                value={formatNumber(projection.projectedPool)}
                delta={projection.projectedPool - projection.currentPool}
                tone="gold"
              />
              <Stat
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="הודעות WhatsApp/SMS"
                value={formatNumber(projection.projectedMessages)}
                delta={projection.projectedMessages - projection.currentMessages}
                tone="gold"
              />
            </div>

            {/* Upsell line + Apply CTA (real users only) */}
            {!isDemoMode && (
              <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-foreground/80">
                  {isUpgrade ? (
                    <>
                      שדרוג ל-<span className="font-bold text-primary">{projected} {unitsLabel}</span> פותח{' '}
                      <span className="font-bold text-gold">+{formatNumber(projection.extraMinutes)}</span> דקות AI ו-{' '}
                      <span className="font-bold text-gold">+{formatNumber(projection.extraReach)}</span> {audienceLabel}.
                    </>
                  ) : isDowngrade ? (
                    <>הקטנת היעד דורשת התאמת חבילה - דבר עם איש האסטרטגיה שלנו.</>
                  ) : (
                    <>זהו היעד הפעיל שלך. שנה אותו כדי לראות פוטנציאל גידול.</>
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  disabled={!isUpgrade && !isDowngrade}
                  className="shrink-0 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
                >
                  {(() => {
                    const monthlyDelta = monthlyPackagePrice(projected) - monthlyPackagePrice(currentPlan);
                    if (isUpgrade) return `הוסף ₪${formatNumber(monthlyDelta)}/חודש`;
                    if (isDowngrade) return `חסוך ₪${formatNumber(Math.abs(monthlyDelta))}/חודש`;
                    return 'היעד הפעיל';
                  })()}
                </Button>
              </div>
            )}
          </div>
        )}

      </div>
      </div>

      <UpgradePlanModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentTarget={currentPlan}
        newTarget={projected}
        unitLabel={unitLabel}
        unitsLabel={unitsLabel}
        audienceLabel={audienceLabel}
        currentReach={projection.currentReach}
        projectedReach={projection.projectedReach}
        currentMinutes={projection.currentMinutes}
        projectedMinutes={projection.projectedMinutes}
        currentPool={projection.currentPool}
        projectedPool={projection.projectedPool}
        isDowngrade={isDowngrade}
        isPrimaries={isPrimaries}
        upliftPercent={upliftPercent}
      />
    </TooltipProvider>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: number;
  tone: 'gold' | 'muted';
}

function Stat({ icon, label, value, delta, tone }: StatProps) {
  const showDelta = delta !== 0;
  const deltaClass = tone === 'gold' && delta > 0
    ? 'text-gold'
    : delta < 0
      ? 'text-destructive'
      : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-primary/10 bg-background/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-base font-bold tabular-nums text-primary">{value}</span>
        {showDelta && (
          <span className={`text-[11px] font-bold tabular-nums ${deltaClass}`}>
            {delta > 0 ? '+' : ''}
            {formatNumber(delta)}
          </span>
        )}
      </div>
    </div>
  );
}
