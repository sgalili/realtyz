/* ============================================================================
 * SubscriptionManager — high-fidelity ROI calculator
 * Clean, light-theme overhaul matching Realtyz dashboard identity:
 *  - Off-white surface, navy headers, blue primary accents
 *  - White cards with subtle borders + soft shadows
 *  - 2-col grid for ROI results, horizontal slider, semantic tokens only
 * Two-way bound to global useMandate() + useElectionType() for full sync.
 * ============================================================================ */

import { motion, AnimatePresence } from 'framer-motion';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Calculator,
  Sparkles,
  AlertTriangle,
  Info,
  ChevronDown,
  MessageSquare,
  Bot,
  Users,
  HelpCircle,
  AudioLines,
  Mail,
  ExternalLink,
  SlidersHorizontal,
  FileSpreadsheet,
  Target,
  CalendarClock,
  CheckCircle2,
  Minus,
  Plus,
} from 'lucide-react';
import {
  FaWhatsapp,
  FaFacebookF,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
  FaTelegram,
  FaYoutube,
  FaSignalMessenger,
} from 'react-icons/fa6';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useMandate } from '@/hooks/useMandate';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useElectionType as useGlobalElectionType } from '@/hooks/useElectionType';
import { RealtyzWave } from '@/components/RealtyzWave';
import { monthsUntilElection as calcMonthsUntilElection } from '@/lib/electionDate';

/* ── Pricing model ─────────────────────────────────────────────────────── */

type Election = 'national' | 'primaries';
type TierId = 'breakthrough' | 'power' | 'victory';

const TIER_NAMES_BY_ELECTION: Record<Election, Record<TierId, string>> = {
  national: {
    breakthrough: '1-2 עסקאות',
    power: '3-9 עסקאות',
    victory: '10+ עסקאות',
  },
  primaries: {
    breakthrough: '1-2 מושבים',
    power: '3-9 מושבים',
    victory: '10+ מושבים',
  },
};

const SETUP_FEE = 5_000;
const TIER_INCLUDED_MANDATES: Record<TierId, number> = { breakthrough: 2, power: 9, victory: 10 };
const TIER_START_MANDATE: Record<TierId, number> = { breakthrough: 1, power: 5, victory: 10 };
const VICTORY_PER_EXTRA_MANDATE = 1_000;
const VOICE_FLAT_RATE = 1.0;
const TIER_INCLUDED_VOICE_MINUTES: Record<TierId, number> = {
  breakthrough: 1_500, power: 5_000, victory: 7_000,
};
const VOICE_MINUTES_PER_EXTRA_MANDATE = 500;
const TIER_INCLUDED_TOUCHPOINTS: Record<TierId, number> = {
  breakthrough: 750_000, power: 3_750_000, victory: 15_000_000,
};
const EXTRA_SEAT_RATE = 200;
const TIER_CARD_PRICE: Record<Election, Record<TierId, number>> = {
  national: { breakthrough: 4_999, power: 9_999, victory: 14_999 },
  primaries: { breakthrough: 4_999, power: 9_999, victory: 14_999 },
};

function pickTierForMandates(m: number): TierId {
  const x = Math.max(1, Math.round(m));
  if (x <= TIER_INCLUDED_MANDATES.breakthrough) return 'breakthrough';
  if (x < TIER_START_MANDATE.victory) return 'power';
  return 'victory';
}

function includedSeatsForMandates(m: number): number {
  const x = Math.max(1, Math.round(m));
  if (x <= 2) return 3;
  if (x <= 5) return 5;
  return Math.ceil(x / 5) * 5;
}

function includedVoiceMinutesForMandates(m: number): number {
  const x = Math.max(1, Math.round(m));
  const tier = pickTierForMandates(x);
  const base = TIER_INCLUDED_VOICE_MINUTES[tier];
  if (x <= TIER_START_MANDATE.victory) return base;
  return base + (x - TIER_START_MANDATE.victory) * VOICE_MINUTES_PER_EXTRA_MANDATE;
}

function monthlyPackagePrice(m: number, e: Election): number {
  const x = Math.max(1, Math.round(m));
  const p1 = TIER_CARD_PRICE[e].breakthrough;
  const p5 = TIER_CARD_PRICE[e].power;
  const p10 = TIER_CARD_PRICE[e].victory;
  if (x <= 1) return p1;
  if (x <= 5) return Math.round(p1 + (p5 - p1) * ((x - 1) / 4));
  if (x <= 10) return Math.round(p5 + (p10 - p5) * ((x - 5) / 5));
  return p10 + (x - TIER_START_MANDATE.victory) * VICTORY_PER_EXTRA_MANDATE;
}

const SMS_RATE = 0.02;
const EMAIL_RATE = 0.01;
const VOICE_RATE = VOICE_FLAT_RATE;
const VOICE_MIN_MINUTES = 0;
const WHATSAPP_META_RATE_HIGH = 0.10;
const WHATSAPP_META_RATE = 0.10;
const WHATSAPP_FREE_TIER_PER_MONTH = 1_000;
const META_WBA_PRICING_URL = 'https://developers.facebook.com/docs/whatsapp/pricing/';
const TOUCHPOINTS_PER_VOTER_TOTAL = 15;
const WARM_CONVERSION_NATIONAL = 0.4;
const WARM_CONVERSION_PRIMARIES = 0.45;
const COLD_CONVERSION = 0.1;
const BLENDED_CONVERSION_DISPLAY = 0.15;

const warmConversionFor = (e: Election) => e === 'primaries' ? WARM_CONVERSION_PRIMARIES : WARM_CONVERSION_NATIONAL;
const votesPerMandateFor = (e: Election) => e === 'primaries' ? 2_500 : 38_000;
const listPerMandateFor = (e: Election) => Math.round(votesPerMandateFor(e) / BLENDED_CONVERSION_DISPLAY);

const DB_TIER_1_THRESHOLD = 1_500_000;
const DB_TIER_1_FEE = 750;
const DB_TIER_2_THRESHOLD = 2_500_000;
const DB_TIER_2_FEE = 1_250;

/* ── Formatters ────────────────────────────────────────────────────────── */
const formatILS = (n: number) => new Intl.NumberFormat('he-IL').format(Math.round(n));
const formatCompact = formatILS;

/* ── Election context bridge: persists across the whole app via the global
 * ElectionType provider. */
function useElectionType() {
  const { type, setType, terms } = useGlobalElectionType();
  return {
    type: type as Election,
    setType: (t: Election) => setType(t),
    terms,
  };
}

/* ── InfoTip ───────────────────────────────────────────────────────────── */
function InfoTip({
  children, title, label = 'מידע נוסף', side = 'top', contentClassName,
}: {
  children: ReactNode; title?: ReactNode; label?: string;
  side?: 'top' | 'right' | 'bottom' | 'left'; contentClassName?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        dir="rtl"
        className={cn(
          'z-50 max-w-[300px] rounded-lg border border-border bg-card p-3 text-[12.5px] leading-relaxed text-foreground shadow-md',
          contentClassName,
        )}
      >
        {title && <div className="mb-1.5 font-bold text-primary">{title}</div>}
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/* ── RotatingChannelIcon ───────────────────────────────────────────────── */
function RotatingChannelIcon({ size = 19, frozen = false }: { size?: number; frozen?: boolean }) {
  const icons = [
    { Icon: Bot, color: 'hsl(var(--primary))' },
    { Icon: FaFacebookF, color: '#1877F2' },
    { Icon: FaInstagram, color: '#E4405F' },
    { Icon: FaTiktok, color: 'hsl(var(--foreground))' },
    { Icon: FaXTwitter, color: 'hsl(var(--foreground))' },
    { Icon: FaTelegram, color: '#26A5E4' },
    { Icon: FaYoutube, color: '#FF0000' },
    { Icon: FaSignalMessenger, color: '#3A76F0' },
  ];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % icons.length), 1400);
    return () => clearInterval(id);
  }, [icons.length, frozen]);
  const eff = frozen ? 0 : index;
  const { Icon, color } = icons[eff];
  return (
    <div className="inline-flex h-5 w-5 items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={eff}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.25 }}
          style={{ color }}
        >
          <Icon size={size} />
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ── FormulaRow ────────────────────────────────────────────────────────── */
function FormulaRow({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('text-[12.5px] font-bold tabular-nums', value > 0 ? 'text-foreground' : 'text-emerald-600')}>
        {value > 0 ? <><span className="ml-0.5">₪</span>{formatILS(value)}</> : 'כלול'}
      </div>
    </div>
  );
}

/* ── WarnBlock ─────────────────────────────────────────────────────────── */
function WarnBlock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Main page
 * ════════════════════════════════════════════════════════════════════════ */
export default function SubscriptionManager() {
  return <CalculatorBody />;
}

function CalculatorBody() {
  const { type: election, setType: setElection, terms } = useElectionType();
  const { selectedMandates, setSelectedMandates, max: GLOBAL_MAX } = useMandate();
  const { user } = useAuth();

  const VOTES_PER_MANDATE = votesPerMandateFor(election);
  const LIST_PER_MANDATE = listPerMandateFor(election);
  const isPrimaries = election === 'primaries';
  const WARM_CONVERSION = warmConversionFor(election);
  const warmPct = Math.round(WARM_CONVERSION * 100);
  const coldPct = Math.round(COLD_CONVERSION * 100);

  // Localized unit nouns (sync with global terms)
  const unitSingular = terms.seat;          // עסקה / מושב
  const unitPlural = terms.seats;           // עסקאות / מושבים
  const voterPlural = terms.votes;          // קולות / מתפקדים
  const memberPlural = terms.voters;        // מתעניינים / מתפקדים

  const mandates = selectedMandates;
  const handleMandates = (n: number) => setSelectedMandates(n);

  const mandatesMax = GLOBAL_MAX;
  const mandatesMin = 1;

  const [warmSize, setWarmSize] = useState(isPrimaries ? 3_000 : 50_000);
  const [coldSize, setColdSize] = useState(isPrimaries ? 15_000 : 200_000);

  // Election day: 27 October 2026 (single source of truth in @/lib/electionDate)
  const monthsUntilElection = useMemo(() => {
    return Math.max(1, Math.min(24, calcMonthsUntilElection()));
  }, []);
  const [months, setMonths] = useState(() => Math.min(6, monthsUntilElection));
  useEffect(() => { setMonths((m) => Math.min(m, monthsUntilElection)); }, [monthsUntilElection]);

  useEffect(() => {
    if (isPrimaries) { setWarmSize(3_000); setColdSize(15_000); }
    else { setWarmSize(50_000); setColdSize(200_000); }
  }, [isPrimaries]);

  const warmMin = 0, warmMax = isPrimaries ? 1_000_000 : 3_000_000, warmStep = isPrimaries ? 1_000 : 50_000;
  const coldMin = 0, coldMax = isPrimaries ? 1_000_000 : 3_000_000, coldStep = isPrimaries ? 5_000 : 50_000;

  const listSize = warmSize + coldSize;
  const projectedVotes = Math.round(warmSize * WARM_CONVERSION + coldSize * COLD_CONVERSION);
  const requiredVotes = mandates * VOTES_PER_MANDATE;
  const listShortfall = projectedVotes < requiredVotes;
  const projectedMandates = Math.max(0, Math.floor(projectedVotes / VOTES_PER_MANDATE));
  const optimizedMandates = Math.max(1, Math.min(mandatesMax, Math.floor(projectedVotes / VOTES_PER_MANDATE)));

  const RECOMMENDED_WARM_RATIO = 0.2, RECOMMENDED_COLD_RATIO = 0.8;
  const _combined = RECOMMENDED_WARM_RATIO * WARM_CONVERSION + RECOMMENDED_COLD_RATIO * COLD_CONVERSION;
  const _rawTotal = _combined > 0 ? Math.ceil(requiredVotes / _combined) : 0;
  const snapUp = (v: number, step: number, mn: number, mx: number) =>
    Math.min(mx, Math.max(mn, Math.ceil(v / step) * step));
  const recommendedWarm = snapUp(_rawTotal * RECOMMENDED_WARM_RATIO, warmStep, warmMin, warmMax);
  const recommendedCold = snapUp(_rawTotal * RECOMMENDED_COLD_RATIO, coldStep, coldMin, coldMax);

  const precisionAudience = Math.round(requiredVotes * 1.3);
  const engagementAudience = precisionAudience;
  const channelAudience = Math.max(engagementAudience, listSize);

  const [touchpointsPerVoter, setTouchpointsPerVoter] = useState(TOUCHPOINTS_PER_VOTER_TOTAL);
  const totalCampaignTouchpoints = engagementAudience * touchpointsPerVoter;

  const SMS_PER_MANDATE = 50_000, EMAIL_PER_MANDATE = 100_000, WHATSAPP_PER_MANDATE = 10_000;
  const smsTouches = isPrimaries ? 2 : 1;
  const smsAudienceFloor = Math.round((channelAudience * smsTouches) / Math.max(1, months));
  const suggestedSms = Math.max(mandates * SMS_PER_MANDATE, smsAudienceFloor);
  const suggestedVoiceMinutes = Math.max(VOICE_MIN_MINUTES, includedVoiceMinutesForMandates(mandates));
  const suggestedEmails = mandates * EMAIL_PER_MANDATE;
  const suggestedWhatsapp = Math.max(1, mandates) * WHATSAPP_PER_MANDATE;

  const [smsVolume, setSmsVolume] = useState(suggestedSms);
  const [smsTouched, setSmsTouched] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceVolume, setVoiceVolume] = useState(VOICE_MIN_MINUTES);
  const [voiceTouched, setVoiceTouched] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailVolume, setEmailVolume] = useState(suggestedEmails);
  const [emailTouched, setEmailTouched] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappVolume, setWhatsappVolume] = useState(suggestedWhatsapp);
  const [whatsappTouched, setWhatsappTouched] = useState(false);
  const [extraSeats, setExtraSeats] = useState(0);
  const [audienceListsOpen, setAudienceListsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [audienceTouched, setAudienceTouched] = useState(false);
  const [inputsTouched, setInputsTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!smsTouched) setSmsVolume(suggestedSms); }, [suggestedSms, smsTouched]);
  useEffect(() => { if (!emailTouched) setEmailVolume(suggestedEmails); }, [suggestedEmails, emailTouched]);
  useEffect(() => { if (!whatsappTouched) setWhatsappVolume(suggestedWhatsapp); }, [suggestedWhatsapp, whatsappTouched]);
  useEffect(() => {
    if (voiceEnabled) {
      setVoiceVolume(includedVoiceMinutesForMandates(mandates));
      setVoiceTouched(false);
    } else { setVoiceVolume(0); setVoiceTouched(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const effectiveSms = smsTouched ? smsVolume : suggestedSms;
  const effectiveEmails = emailTouched ? emailVolume : suggestedEmails;
  const effectiveWhatsapp = whatsappTouched ? whatsappVolume : suggestedWhatsapp;
  const effectiveVoiceMinutes = voiceEnabled ? Math.max(0, voiceVolume) : 0;

  const activeTier = pickTierForMandates(mandates);
  const includedSms = suggestedSms;
  const includedEmails = suggestedEmails;
  const includedVoiceMinutes = includedVoiceMinutesForMandates(mandates);
  const includedTouchpoints = TIER_INCLUDED_TOUCHPOINTS[activeTier];

  useEffect(() => {
    if (voiceEnabled && !voiceTouched) setVoiceVolume(includedVoiceMinutes);
  }, [voiceEnabled, voiceTouched, includedVoiceMinutes]);

  const smsOverage = Math.max(0, effectiveSms - includedSms);
  const monthlySmsCost = smsOverage * SMS_RATE;
  const emailOverage = emailEnabled ? Math.max(0, effectiveEmails - includedEmails) : 0;
  const monthlyEmailCost = emailOverage * EMAIL_RATE;

  const VOICE_CREDIT_BACK_RATE = 0.5;
  const voiceOverageMinutes = voiceEnabled ? Math.max(0, effectiveVoiceMinutes - includedVoiceMinutes) : 0;
  const cardPackagePrice = monthlyPackagePrice(mandates, election);
  const voiceUnusedMinutes = voiceEnabled ? Math.max(0, includedVoiceMinutes - effectiveVoiceMinutes) : includedVoiceMinutes;
  const voiceOffCredit = Math.round(voiceUnusedMinutes * VOICE_CREDIT_BACK_RATE);
  const monthlyVoiceCost = voiceEnabled ? voiceOverageMinutes * VOICE_FLAT_RATE : 0;

  const touchpointsOverage = Math.max(0, touchpointsPerVoter - TOUCHPOINTS_PER_VOTER_TOTAL);
  const monthlyTouchpointCost = Math.round((touchpointsOverage * engagementAudience * 0.02) / Math.max(1, months));

  const whatsappBillable = Math.max(0, effectiveWhatsapp - WHATSAPP_FREE_TIER_PER_MONTH);
  const monthlyWhatsappTotalMetaCost = whatsappBillable * WHATSAPP_META_RATE;

  const dbTier2Active = audienceTouched && listSize > DB_TIER_2_THRESHOLD;
  const dbTier1Active = audienceTouched && !dbTier2Active && listSize > DB_TIER_1_THRESHOLD;
  const audienceScalingFee = dbTier2Active ? DB_TIER_2_FEE : dbTier1Active ? DB_TIER_1_FEE : 0;

  const includedSeats = includedSeatsForMandates(mandates);
  const totalSeats = includedSeats + Math.max(0, extraSeats);
  const monthlySeatsCost = Math.max(0, extraSeats) * EXTRA_SEAT_RATE;

  const monthlyTotal = useMemo(() => (
    cardPackagePrice - voiceOffCredit + monthlySmsCost + monthlyEmailCost +
    monthlyVoiceCost + audienceScalingFee + monthlyTouchpointCost + monthlySeatsCost
  ), [cardPackagePrice, voiceOffCredit, monthlySmsCost, monthlyEmailCost, monthlyVoiceCost, audienceScalingFee, monthlyTouchpointCost, monthlySeatsCost]);
  const periodTotal = monthlyTotal * months + SETUP_FEE;

  const handleMandatesChange = (m: number) => {
    handleMandates(m);
    setInputsTouched(true);
    setSmsTouched(false);
    setAudienceTouched(false);
    setAudienceListsOpen(true);

    const newRequired = m * VOTES_PER_MANDATE;
    const combined = 0.2 * WARM_CONVERSION + 0.8 * COLD_CONVERSION;
    const rawTotal = combined > 0 ? Math.ceil(newRequired / combined) : 0;
    let nextWarm = snapUp(rawTotal * 0.2, warmStep, warmMin, warmMax);
    let nextCold = snapUp(rawTotal * 0.8, coldStep, coldMin, coldMax);
    const proj = () => Math.round(nextWarm * WARM_CONVERSION + nextCold * COLD_CONVERSION);
    if (proj() < newRequired && nextCold < coldMax) {
      const def = newRequired - proj();
      const extra = COLD_CONVERSION > 0 ? Math.ceil(def / COLD_CONVERSION) : 0;
      nextCold = Math.min(coldMax, nextCold + Math.ceil(extra / coldStep) * coldStep);
    }
    if (proj() < newRequired && nextWarm < warmMax) {
      const def = newRequired - proj();
      const extra = WARM_CONVERSION > 0 ? Math.ceil(def / WARM_CONVERSION) : 0;
      nextWarm = Math.min(warmMax, nextWarm + Math.ceil(extra / warmStep) * warmStep);
    }
    setColdSize(nextCold);
    setWarmSize(nextWarm);
  };

  const handleUpdatePlan = async () => {
    if (!user) {
      toast.error('יש להתחבר כדי לעדכן את החבילה');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .upsert({
          user_id: user.id,
          mandate_target: mandates,
          election_type: election === 'primaries' ? 'primaries' : 'general',
          months_to_election: months,
          hot_list_count: warmSize,
          cold_list_count: coldSize,
          hot_conversion_rate: WARM_CONVERSION * 100,
          cold_conversion_rate: COLD_CONVERSION * 100,
          status: 'active',
        }, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success(`החבילה עודכנה · ₪${formatILS(monthlyTotal)}/חודש · ${mandates} ${unitPlural}`);
    } catch (e) {
      toast.error('שגיאה בעדכון החבילה');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      key={election}
      dir="rtl"
      data-no-hero-wave
      data-page="subscription"
      className="relative isolate -mx-6 -mb-6 min-h-[calc(100vh-4rem)] w-[calc(100%+3rem)] bg-slate-50"
    >
      {/* ════════ Navy hero band with wave (mirrors dashboard hero) ════════ */}
      <div className="relative isolate overflow-hidden bg-primary text-primary-foreground">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-14 pt-10 text-center sm:px-6 sm:pb-16 sm:pt-12"
        >
          <h1 className="text-3xl font-black leading-tight text-primary-foreground sm:text-4xl">
            חבילת Premium Agent — ניהול עסקי הסוכנות
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/80 sm:text-base">
            החבילה שלך מותאמת אישית לפי יעד עסקאות סגורות בשנה
          </p>

          {/* Election toggle */}
          <div className="mx-auto mt-5 inline-flex items-center gap-1 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 p-1 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setElection('national')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                !isPrimaries
                  ? 'bg-primary-foreground text-primary shadow-sm'
                  : 'text-primary-foreground/80 hover:text-primary-foreground',
              )}
            >
              מכירות כלליות
            </button>
            <button
              type="button"
              onClick={() => setElection('primaries')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                isPrimaries
                  ? 'bg-primary-foreground text-primary shadow-sm'
                  : 'text-primary-foreground/80 hover:text-primary-foreground',
              )}
            >
              פריימריז
            </button>
          </div>
        </motion.div>

        {/* Bottom hero wave - mirrors dashboard HeroWaveMount */}
        <RealtyzWave
          position="bottom"
          variant="wave-soft"
          fill="hsl(210 40% 98%)"
          seed={7}
          height={28}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10">
        {isPrimaries && (
          <div className="mx-auto mb-6 max-w-3xl rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-center text-[12.5px] font-medium text-primary">
            מצב פריימריז: מושב אחד ≈ 2,500 מתפקדים מזוהים.
          </div>
        )}

        {/* ════════ 2-column ROI grid ════════ */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Left column: Goal + Audience ── */}
          <div className="space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              id="calc-command"
              className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"
            >
              <header className="mb-4 flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">יעד עסקאות סגורות</h2>
              </header>

              {/* Closed Deal Goal stepper */}
              <div className="rounded-xl border border-border bg-secondary/40 p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  כמה עסקאות סגורות אנחנו מכוונים אליהן?
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleMandatesChange(Math.max(mandatesMin, mandates - 1))}
                    disabled={mandates <= mandatesMin}
                    aria-label={`הקטן יעד ${unitPlural}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm transition-all hover:border-primary hover:bg-primary/10 active:scale-95 disabled:opacity-30 sm:h-14 sm:w-14"
                  >
                    <Minus className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                  <input
                    type="number"
                    min={mandatesMin}
                    max={mandatesMax}
                    value={mandates}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10);
                      if (Number.isNaN(raw)) return;
                      handleMandatesChange(Math.min(mandatesMax, Math.max(mandatesMin, raw)));
                    }}
                    aria-label={`יעד ${unitPlural}`}
                    className="realtyz-num-input w-[3ch] min-w-[2ch] rounded-md bg-transparent text-center text-[42px] font-black tabular-nums text-foreground outline-none focus:ring-2 focus:ring-primary/40 sm:text-[52px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleMandatesChange(Math.min(mandatesMax, mandates + 1))}
                    disabled={mandates >= mandatesMax}
                    aria-label={`הגדל יעד ${unitPlural}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm transition-all hover:border-primary hover:bg-primary/10 active:scale-95 disabled:opacity-30 sm:h-14 sm:w-14"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="mt-3 text-center text-[12.5px] font-medium text-muted-foreground">
                  הערכת שיעור המרה: עסקה סגורה אחת לכל ~60 מתעניינים מוסמכים
                </div>
                <div className="mt-1 text-center text-[11px] text-muted-foreground/80">
                  {mandates === 1
                    ? `יעד: עסקה סגורה אחת ≈ ${formatILS(60)} מתעניינים מוסמכים בניהול מתעניינים`
                    : `יעד: ${mandates} עסקאות סגורות ≈ ${formatILS(mandates * 60)} מתעניינים מוסמכים בניהול מתעניינים`}
                </div>
              </div>

              {/* Audience trigger */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setAudienceListsOpen((v) => !v)}
                  aria-expanded={audienceListsOpen}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-right transition-colors hover:border-primary/40 hover:bg-secondary/40"
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    פילוח קהל (Leading) · רשימות מתעניינים
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{formatILS(listSize)}</span>
                    <ChevronDown className={cn('h-4 w-4 text-primary transition-transform', audienceListsOpen && 'rotate-180')} />
                  </span>
                </button>
                <div className="mt-2 text-[11.5px] text-muted-foreground">
                  מומלץ:{' '}
                  <span className="font-bold text-primary">{formatILS(recommendedWarm)}</span> חמות
                  {' ו-'}
                  <span className="font-bold text-primary">{formatILS(recommendedCold)}</span> קרות
                </div>

                <AnimatePresence initial={false}>
                  {audienceListsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-4 rounded-lg border border-border bg-secondary/40 p-4">
                        <div className="text-[12px] text-muted-foreground">
                          כמה מתעניינים יש לכם במאגר / ברשימות הפעילות?
                        </div>

                        {/* Warm */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                              {isPrimaries ? 'מתפקדים תומכים' : 'רשימה חמה'}
                              <InfoTip title={isPrimaries ? 'מתפקדים תומכים' : 'רשימה חמה'}>
                                אנשים שכבר מכירים אתכם או הביעו תמיכה. שיעור המרה גבוה ({warmPct}%).
                              </InfoTip>
                            </div>
                            <span className="text-[12.5px] font-bold tabular-nums text-foreground">{formatILS(warmSize)}</span>
                          </div>
                          <input
                            type="range"
                            min={warmMin}
                            max={warmMax}
                            step={warmStep}
                            value={warmSize}
                            onChange={(e) => { setWarmSize(Number(e.target.value)); setAudienceTouched(true); setInputsTouched(true); setSmsTouched(false); }}
                            className="realtyz-range realtyz-range--sm"
                            dir="ltr"
                          />
                        </div>

                        {/* Cold */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                              <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                              {isPrimaries ? 'פוטנציאל מתפקדים' : 'רשימה קרה'}
                              <InfoTip title={isPrimaries ? 'פוטנציאל מתפקדים' : 'רשימה קרה'}>
                                מתעניינים פוטנציאליים שעדיין לא מכירים אתכם. שיעור המרה נמוך ({coldPct}%) אך הקהל גדול בהרבה.
                              </InfoTip>
                            </div>
                            <span className="text-[12.5px] font-bold tabular-nums text-foreground">{formatILS(coldSize)}</span>
                          </div>
                          <input
                            type="range"
                            min={coldMin}
                            max={coldMax}
                            step={coldStep}
                            value={coldSize}
                            onChange={(e) => { setColdSize(Number(e.target.value)); setAudienceTouched(true); setInputsTouched(true); setSmsTouched(false); }}
                            className="realtyz-range realtyz-range--sm"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {inputsTouched && listShortfall && (
                  <WarnBlock>
                    התמהיל מניב <span className="font-black">{formatILS(projectedVotes)}</span> מתעניינים מוסמכים, מתוך{' '}
                    <span className="font-black">{formatILS(requiredVotes)}</span> מתעניינים נדרשים ליעד של {mandates} עסקאות סגורות.
                    <button
                      type="button"
                      onClick={() => handleMandatesChange(Math.max(1, optimizedMandates))}
                      className="mt-1.5 block text-[12px] font-black underline decoration-destructive/60 underline-offset-2 hover:text-destructive"
                    >
                      התאם יעד ל-{optimizedMandates} עסקאות ←
                    </button>
                  </WarnBlock>
                )}
              </div>

              {/* Months */}
              <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    משך השירות
                  </span>
                  <span className="text-[12.5px] font-bold tabular-nums text-primary">{months} חודשים</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={monthsUntilElection}
                  step={1}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="realtyz-range realtyz-range--sm"
                  dir="ltr"
                />
                <div className="mt-1 text-[10.5px] text-muted-foreground">
                  עד המכירות נשארו ~{monthsUntilElection} חודשים
                </div>
              </div>
            </motion.section>
          </div>

          {/* ── Right column: Output + Resources ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"
          >
            <header className="mb-3 flex items-center gap-2">
              <RotatingChannelIcon size={19} />
              <h2 className="text-lg font-bold text-foreground">סיכום החבילה שלך</h2>
            </header>

            {/* Hero price card */}
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {TIER_NAMES_BY_ELECTION[election][activeTier]}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <motion.span
                  key={monthlyTotal}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-baseline text-4xl font-black text-foreground sm:text-5xl"
                >
                  <span className="ml-1 text-[0.7em] font-bold text-foreground/80">₪</span>
                  <span className="tabular-nums">{formatILS(monthlyTotal)}</span>
                </motion.span>
                <span className="text-base font-bold text-muted-foreground">
                  / חודש <span className="text-[11px] text-muted-foreground/70">(× {months} חודשים)</span>
                </span>
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                סה״כ לתקופה: <span className="font-bold text-foreground tabular-nums">₪{formatILS(periodTotal)}</span> (כולל הקמה ₪{formatILS(SETUP_FEE)})
              </div>

              {whatsappEnabled && monthlyWhatsappTotalMetaCost > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                  <FaWhatsapp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="flex-1 text-[11.5px] text-emerald-700">
                    +₪{formatILS(monthlyWhatsappTotalMetaCost)} ({formatCompact(effectiveWhatsapp)} שיחות ווטסאפ
                    <span className="opacity-70"> - תשלום בנפרד למטא</span>)
                  </div>
                </div>
              )}
            </div>

            {/* Resources panel */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="mt-4 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-right transition-colors hover:border-primary/40 hover:bg-secondary/40"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                תמהיל המשאבים ליעד
              </span>
              <ChevronDown className={cn('h-4 w-4 text-primary transition-transform', advancedOpen && 'rotate-180')} />
            </button>

            <AnimatePresence initial={false}>
              {advancedOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-4 rounded-lg border border-border bg-secondary/40 p-4">
                    <ResourceSlider
                      icon={<Users className="h-4 w-4 text-primary" />}
                      title="חשיפה לשוק (Market Exposure)"
                      info={<>כלל הזהב המקצועי: {TOUCHPOINTS_PER_VOTER_TOTAL} נקודות חשיפה לכל מתעניין עד להבשלת עסקה. הפחתה תקטין הוצאה אך גם את סיכויי הסגירה.</>}
                      min={5} max={30} step={1}
                      value={touchpointsPerVoter}
                      onChange={setTouchpointsPerVoter}
                      valueLabel={`${touchpointsPerVoter} חשיפות / מתעניין · סה״כ ${formatCompact(totalCampaignTouchpoints)}`}
                      cost={monthlyTouchpointCost}
                      onReset={touchpointsPerVoter !== TOUCHPOINTS_PER_VOTER_TOTAL ? () => setTouchpointsPerVoter(TOUCHPOINTS_PER_VOTER_TOTAL) : undefined}
                    />

                    <ResourceSlider
                      icon={<MessageSquare className="h-4 w-4 text-primary" />}
                      title="עדכונים לאימות (SMS)"
                      rateNote={`₪${SMS_RATE.toFixed(2)} / עדכון`}
                      info={<>{formatILS(includedSms)} עדכוני אימות (SMS) כלולים בחבילה — לאישורי פגישה, קודי OTP ועדכוני סטטוס למתעניינים. מעבר לכך, חיוב של ₪{SMS_RATE.toFixed(2)} להודעה.</>}
                      min={0} max={Math.max(suggestedSms * 3, 1_000_000)} step={5_000}
                      value={effectiveSms}
                      onChange={(v) => { setSmsVolume(v); setSmsTouched(true); }}
                      valueLabel={`${formatILS(effectiveSms)} עדכונים / חודש`}
                      cost={monthlySmsCost}
                      onReset={smsTouched && effectiveSms !== suggestedSms ? () => setSmsTouched(false) : undefined}
                      below={smsTouched && effectiveSms < suggestedSms ? `מתחת למומלץ (${formatILS(suggestedSms)})` : undefined}
                    />

                    <ResourceSlider
                      icon={<Mail className="h-4 w-4 text-primary" />}
                      title="שיווק נכסים (Listing Email)"
                      rateNote={`₪${EMAIL_RATE.toFixed(2)} / שליחה`}
                      info={<>{formatILS(includedEmails)} מיילים מעוצבים לקידום נכסים כלולים בחבילה — כולל גלריות, סיורים וירטואליים והזמנות פתוחות. מעבר לכך, ₪{EMAIL_RATE.toFixed(2)} לשליחה.</>}
                      min={0} max={Math.max(suggestedEmails * 3, 2_000_000)} step={10_000}
                      value={effectiveEmails}
                      onChange={(v) => { setEmailVolume(v); setEmailTouched(true); }}
                      valueLabel={`${formatCompact(effectiveEmails)} שליחות / חודש`}
                      cost={monthlyEmailCost}
                      onReset={emailTouched && effectiveEmails !== suggestedEmails ? () => setEmailTouched(false) : undefined}
                      enabled={emailEnabled}
                      onToggle={() => setEmailEnabled((v) => !v)}
                    />

                    <ResourceSlider
                      icon={<AudioLines className="h-4 w-4 text-primary" />}
                      title="שיחות סינון מתעניינים (AI)"
                      rateNote={`₪${VOICE_RATE.toFixed(2)} / דקה`}
                      info={<>סוכן AI קולי שמסנן מתעניינים נכנסים, מאמת תקציב, צרכי דיור ולוחות זמנים — ומעביר אליך רק מתעניינים חמים ומוכנים לפגישה. תמחור: דקות בפועל × ₪{VOICE_RATE.toFixed(2)}.</>}
                      min={0} max={Math.max(suggestedVoiceMinutes * 3, 50_000)} step={500}
                      value={effectiveVoiceMinutes}
                      onChange={(v) => { setVoiceVolume(v); setVoiceTouched(true); }}
                      valueLabel={`${formatILS(effectiveVoiceMinutes)} דקות שיחה / חודש`}
                      cost={monthlyVoiceCost}
                      onReset={voiceTouched && effectiveVoiceMinutes !== includedVoiceMinutes ? () => { setVoiceVolume(includedVoiceMinutes); setVoiceTouched(false); } : undefined}
                      enabled={voiceEnabled}
                      onToggle={() => setVoiceEnabled((v) => !v)}
                      below={voiceTouched && effectiveVoiceMinutes < suggestedVoiceMinutes ? `מתחת למומלץ (${formatILS(suggestedVoiceMinutes)} דקות)` : undefined}
                    />

                    <ResourceSlider
                      icon={<FaWhatsapp className="h-4 w-4 text-emerald-600" />}
                      title="ווטסאפ"
                      rateNote={`~₪${WHATSAPP_META_RATE_HIGH.toFixed(2)} / שיחה (למטא)`}
                      info={
                        <>
                          שיחה אחת = 24 שעות תקשורת ללא הגבלה. Meta מעניקה {formatILS(WHATSAPP_FREE_TIER_PER_MONTH)} שיחות חינם בחודש. כל הסכום משולם ישירות למטא.
                          <a href={META_WBA_PRICING_URL} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-primary underline">
                            מחירון Meta הרשמי <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      }
                      min={0} max={Math.max(suggestedWhatsapp * 3, 500_000)} step={1_000}
                      value={effectiveWhatsapp}
                      onChange={(v) => { setWhatsappVolume(v); setWhatsappTouched(true); }}
                      valueLabel={`${formatCompact(effectiveWhatsapp)} שיחות / חודש`}
                      cost={0}
                      extraCostNote={monthlyWhatsappTotalMetaCost > 0 ? `~₪${formatILS(monthlyWhatsappTotalMetaCost)} למטא` : undefined}
                      onReset={whatsappTouched && effectiveWhatsapp !== suggestedWhatsapp ? () => setWhatsappTouched(false) : undefined}
                      enabled={whatsappEnabled}
                      onToggle={() => setWhatsappEnabled((v) => !v)}
                    />

                    <ResourceSlider
                      icon={<Users className="h-4 w-4 text-primary" />}
                      title="רישיונות סוכן"
                      rateNote={extraSeats > 0 ? `₪${EXTRA_SEAT_RATE} / רישיון נוסף` : undefined}
                      info={<>{includedSeats} רישיונות סוכן כלולים — לכל סוכן במשרד גישה מלאה ל-CRM, לעסקאות ולחתימות הדיגיטליות. ניתן להוסיף רישיונות בעלות של ₪{EXTRA_SEAT_RATE}/חודש לכל סוכן.</>}
                      min={0} max={50} step={1}
                      value={extraSeats}
                      onChange={setExtraSeats}
                      valueLabel={`${totalSeats} רישיונות סוכן סה״כ`}
                      cost={monthlySeatsCost}
                      onReset={extraSeats > 0 ? () => setExtraSeats(0) : undefined}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Formula breakdown */}
            <button
              type="button"
              onClick={() => setShowFormula((v) => !v)}
              aria-expanded={showFormula}
              className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-right transition-colors hover:border-primary/40 hover:bg-secondary/40"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                פירוט נוסחת הניצחון
              </span>
              <ChevronDown className={cn('h-4 w-4 text-primary transition-transform', showFormula && 'rotate-180')} />
            </button>

            <AnimatePresence initial={false}>
              {showFormula && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-4">
                    <div className="mb-2 flex items-center justify-between text-[11.5px] text-muted-foreground">
                      <span>סה״כ ברשימות</span>
                      <span className="font-bold tabular-nums text-foreground">{formatILS(channelAudience)}</span>
                    </div>
                    <FormulaRow
                      icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
                      label={`חבילת ${mandates} ${mandates === 1 ? unitSingular : unitPlural} ≈ ${formatILS(requiredVotes)} ${voterPlural}`}
                      value={cardPackagePrice}
                    />
                    <FormulaRow
                      icon={<MessageSquare className="h-3.5 w-3.5 text-sky-500" />}
                      label={smsOverage > 0
                        ? `מסרונים נוספים ${formatCompact(smsOverage)} × ₪${SMS_RATE.toFixed(2)}`
                        : `${formatCompact(includedSms)} מסרונים SMS`}
                      value={monthlySmsCost}
                    />
                    {emailEnabled && (
                      <FormulaRow
                        icon={<Mail className="h-3.5 w-3.5 text-cyan-600" />}
                        label={emailOverage > 0
                          ? `שליחות נוספות ${formatCompact(emailOverage)} × ₪${EMAIL_RATE.toFixed(2)}`
                          : `${formatCompact(includedEmails)} שליחות אימייל`}
                        value={monthlyEmailCost}
                      />
                    )}
                    {voiceEnabled && (
                      <FormulaRow
                        icon={<AudioLines className="h-3.5 w-3.5 text-violet-500" />}
                        label={`${formatCompact(effectiveVoiceMinutes)} דקות שיחות סינון מתעניינים (AI)`}
                        value={monthlyVoiceCost}
                      />
                    )}
                    {whatsappEnabled && (
                      <FormulaRow
                        icon={<FaWhatsapp className="h-3.5 w-3.5 text-emerald-600" />}
                        label={`${formatCompact(effectiveWhatsapp)} שיחות ווטסאפ (תשלום בנפרד למטא)`}
                        value={0}
                      />
                    )}
                    <FormulaRow
                      icon={<Users className="h-3.5 w-3.5 text-amber-500" />}
                      label={monthlyTouchpointCost > 0
                        ? `חשיפה לשוק נוספת מעבר ל-${formatCompact(includedTouchpoints)}`
                        : `${formatCompact(includedTouchpoints)} חשיפות לשוק ברשתות`}
                      value={monthlyTouchpointCost}
                    />
                    {audienceScalingFee > 0 && (
                      <FormulaRow
                        icon={<AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                        label={dbTier2Active
                          ? `דמי אחסון מאגר מתעניינים, מעל ${formatCompact(DB_TIER_2_THRESHOLD)} מתעניינים`
                          : `דמי אחסון מאגר מתעניינים, מעל ${formatCompact(DB_TIER_1_THRESHOLD)} מתעניינים`}
                        value={audienceScalingFee}
                      />
                    )}
                    <FormulaRow
                      icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
                      label={monthlySeatsCost > 0
                        ? `${extraSeats} רישיונות סוכן נוספים × ₪${EXTRA_SEAT_RATE} (מעל ${includedSeats} כלולים)`
                        : `רישיונות סוכן כלולים: ${includedSeats}`}
                      value={monthlySeatsCost}
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[14px] font-black">
                      <span className="text-foreground">סה״כ לחודש</span>
                      <span className="text-primary tabular-nums">
                        <span className="ml-0.5">₪</span>{formatILS(monthlyTotal)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
                      <span>דמי הקמה חד פעמיים (כולל אימון AI)</span>
                      <span className="font-bold tabular-nums text-foreground">₪{formatILS(SETUP_FEE)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">סה״כ ל-{months} חודשים (כולל הקמה)</span>
                      <span className="font-black tabular-nums text-foreground">₪{formatILS(periodTotal)}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CTA */}
            <button
              type="button"
              onClick={handleUpdatePlan}
              disabled={saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg active:translate-y-px disabled:opacity-60"
            >
              {saving ? (
                'מעדכן...'
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>עדכן חבילה</span>
                  <span className="opacity-90 tabular-nums">· ₪{formatILS(monthlyTotal)}/חודש</span>
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              השינויים מסונכרנים אוטומטית עם בורר יעד העסקאות בכל מסכי המערכת
            </p>
          </motion.section>
        </div>

        {/* ════════ Included Resources feature cards ════════ */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              משאבים כלולים בחבילה
            </h2>
            <span className="text-xs text-muted-foreground">מעודכן ליעד {mandates} {unitPlural}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ResourceFeatureCard
              icon={<Users className="h-5 w-5" />}
              title="רישיונות סוכן"
              value={`${includedSeats} רישיונות`}
              note="גישה מלאה לכל סוכן במשרד — CRM, עסקאות וחתימות"
            />
            <ResourceFeatureCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="עדכונים לאימות (SMS)"
              value={`${formatCompact(includedSms)}/חודש`}
              note={`עלות מעבר: ₪${SMS_RATE.toFixed(2)} להודעה`}
            />
            <ResourceFeatureCard
              icon={<Mail className="h-5 w-5" />}
              title="שיווק נכסים (Listing Email)"
              value={`${formatCompact(includedEmails)}/חודש`}
              note={`עלות מעבר: ₪${EMAIL_RATE.toFixed(2)} לשליחה`}
            />
            <ResourceFeatureCard
              icon={<AudioLines className="h-5 w-5" />}
              title="שיחות סינון מתעניינים (AI)"
              value={`${formatCompact(includedVoiceMinutes)} דקות`}
              note={`עלות מעבר: ₪${VOICE_RATE.toFixed(2)} לדקה`}
            />
            <ResourceFeatureCard
              icon={<FaWhatsapp className="h-5 w-5" />}
              title="ווטסאפ עסקי"
              value={`${formatCompact(WHATSAPP_FREE_TIER_PER_MONTH)} שיחות חינם`}
              note="חיוב נוסף ישירות למטא"
            />
            <ResourceFeatureCard
              icon={<Target className="h-5 w-5" />}
              title="חשיפה לשוק (Market Exposure)"
              value={`${formatCompact(includedTouchpoints)} ברשתות`}
              note="קידום נכסים בכל הערוצים החברתיים"
            />
          </div>
        </section>

        <p className="mx-auto mt-8 max-w-3xl text-center text-[11px] leading-relaxed text-muted-foreground">
          החישוב מבוסס על תמהיל רשימות מתעניינים: {warmPct}% המרה למתעניינים חמים ו-{coldPct}% למתעניינים קרים בעבודה אינטנסיבית עם Realtyz AI.
          המספרים המוצגים הם הערכה מקצועית בלבד ואינם מהווים התחייבות לתוצאת מכירות. המחיר אינו כולל מע״מ ועלויות מדיה ישירות ל-Meta.
        </p>
      </div>

      {/* Inline styles for native range slider + number input (light theme) */}
      <style>{`
        .realtyz-num-input::-webkit-outer-spin-button,
        .realtyz-num-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .realtyz-num-input { -moz-appearance: textfield; appearance: textfield; }

        .realtyz-range {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 6px; border-radius: 9999px;
          background: hsl(var(--secondary)); outline: none;
        }
        .realtyz-range--sm { height: 5px; }
        .realtyz-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 9999px;
          background: hsl(var(--primary)); border: 2px solid #ffffff; cursor: pointer;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
        }
        .realtyz-range::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 9999px;
          background: hsl(var(--primary)); border: 2px solid #ffffff; cursor: pointer;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
        }
      `}</style>
    </div>
  );
}

/* ── ResourceFeatureCard ───────────────────────────────────────────────── */
function ResourceFeatureCard({
  icon, title, value, note,
}: { icon: ReactNode; title: string; value: string; note: string }) {
  return (
    <div className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-muted-foreground">{title}</div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-foreground">{value}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>
        </div>
      </div>
    </div>
  );
}

/* ── ResourceSlider helper ─────────────────────────────────────────────── */
function ResourceSlider({
  icon, title, rateNote, info, min, max, step, value, onChange,
  valueLabel, cost, onReset, enabled = true, onToggle, below, extraCostNote,
}: {
  icon: ReactNode; title: string; rateNote?: string; info: ReactNode;
  min: number; max: number; step: number; value: number;
  onChange: (n: number) => void; valueLabel: string; cost: number;
  onReset?: () => void; enabled?: boolean; onToggle?: () => void;
  below?: string; extraCostNote?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="text-[13px] font-semibold text-foreground">{title}</span>
          {rateNote && <span className="hidden text-[10.5px] text-muted-foreground sm:inline">· {rateNote}</span>}
          <InfoTip>{info}</InfoTip>
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={enabled}
            className={cn(
              'relative h-5 w-9 shrink-0 rounded-full transition-colors',
              enabled ? 'bg-emerald-500' : 'bg-border',
            )}
          >
            <span className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              enabled ? 'translate-x-0.5' : 'translate-x-[18px]',
            )} />
          </button>
        )}
      </div>
      {enabled && (
        <>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="realtyz-range realtyz-range--sm"
            dir="ltr"
          />
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-muted-foreground">
              <span className="font-bold tabular-nums text-foreground">{valueLabel.split(' ')[0]}</span>{' '}
              {valueLabel.split(' ').slice(1).join(' ')}
            </span>
            <div className="flex items-center gap-2">
              {extraCostNote && <span className="font-bold text-emerald-600">{extraCostNote}</span>}
              <span className={cn('font-bold tabular-nums', cost > 0 ? 'text-foreground' : 'text-emerald-600')}>
                {cost > 0 ? <><span className="ml-0.5">₪</span>{formatILS(cost)} +</> : 'כלול'}
              </span>
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-[10px] font-bold text-muted-foreground underline hover:text-foreground"
                >
                  שחזר
                </button>
              )}
            </div>
          </div>
          {below && (
            <div className="text-[10.5px] text-amber-600">{below}</div>
          )}
        </>
      )}
    </div>
  );
}
