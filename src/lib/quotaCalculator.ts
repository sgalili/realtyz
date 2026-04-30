import { VOTES_PER_MANDATE } from '@/lib/mandateCalculator';

/**
 * Single source of truth for plan quotas, pricing, and audience scaling.
 * All features (AI Voice, Voter pools, Budget, Charts, Seats) MUST derive from here.
 *
 * Spec (Kalpiz.co.il sales model):
 *   1  Mandate : ₪4,999  (1,500 AI min, 3 seats,  50k voters)
 *   5  Mandates: ₪9,999  (5,000 AI min, 5 seats, 250k voters)
 *  10  Mandates: ₪14,999 (7,000 AI min, 10 seats, 1M voters)
 *  10+ Mandates: +₪1,000 / mandate, +500 AI min / mandate
 *
 * Audience Scaling Fee (flat brackets):
 *   <=1.5M voters : ₪0
 *   1.5M..2.5M    : ₪750
 *   >2.5M         : ₪1,250 (flat cap)
 *
 * Overage unit costs:
 *   AI Voice      : ₪1.00 / minute
 *   AI Credit-back: ₪0.50 / minute
 */

/** Overage unit costs (₪, ex-VAT). */
export const OVERAGE_UNIT_COSTS = {
  ai_voice: 1.0,        // AI Voice agent — per minute
  ai_credit_back: 0.5,  // AI Credit-back — per minute
} as const;

/** Pricing & quota anchors for linear interpolation. */
export interface PricingAnchor {
  mandates: number;
  price: number;          // ILS, ex-VAT, monthly base
  aiVoiceMinutes: number;
  seats: number;
  voterPool: number;
}

export const PRICING_ANCHORS: PricingAnchor[] = [
  { mandates: 1,  price:  4_999, aiVoiceMinutes: 1_500, seats:  3, voterPool:    50_000 },
  { mandates: 5,  price:  9_999, aiVoiceMinutes: 5_000, seats:  5, voterPool:   250_000 },
  { mandates: 10, price: 14_999, aiVoiceMinutes: 7_000, seats: 10, voterPool: 1_000_000 },
];

/** Dynamic tier (mandate 11+). */
export const DYNAMIC_PRICE_PER_MANDATE = 1_000;        // ₪
export const DYNAMIC_AI_MINUTES_PER_MANDATE = 500;     // minutes
const DYNAMIC_VOTERS_PER_MANDATE = 100_000;
const DYNAMIC_SEATS_PER_MANDATE = 1;

/** Audience scaling fee — flat brackets, NOT additive. */
export const AUDIENCE_SCALING_BRACKETS = [
  { upTo: 1_500_000, fee:     0 },
  { upTo: 2_500_000, fee:   750 },
  { upTo: Infinity,  fee: 1_250 }, // flat cap above 2.5M
];

// ───────────────────────── Linear interpolation helpers ─────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Linear interpolation between the 1/5/10 anchors for any anchor field.
 * For mandates > 10, applies a per-mandate dynamic delta.
 */
function interpolateField(
  mandates: number,
  field: keyof Omit<PricingAnchor, 'mandates'>,
  dynamicDelta: number,
): number {
  const m = Math.max(1, Math.floor(mandates));
  const [a1, a5, a10] = PRICING_ANCHORS;

  if (m <= 1) return a1[field];
  if (m <= 5) {
    const t = (m - 1) / (5 - 1);
    return Math.round(lerp(a1[field], a5[field], t));
  }
  if (m <= 10) {
    const t = (m - 5) / (10 - 5);
    return Math.round(lerp(a5[field], a10[field], t));
  }
  return Math.round(a10[field] + (m - 10) * dynamicDelta);
}

// ───────────────────────── Public API ─────────────────────────

/** AI Voice quota for a mandate count (interpolated 1→5→10, dynamic above). */
export function aiVoiceQuota(mandates: number): number {
  return interpolateField(mandates, 'aiVoiceMinutes', DYNAMIC_AI_MINUTES_PER_MANDATE);
}

/** Voter pool size (interpolated 1→5→10, dynamic above). */
export function voterPool(mandates: number): number {
  return interpolateField(mandates, 'voterPool', DYNAMIC_VOTERS_PER_MANDATE);
}

/** Seats included in the mandate plan. */
export function seatsQuota(mandates: number): number {
  return interpolateField(mandates, 'seats', DYNAMIC_SEATS_PER_MANDATE);
}

/** Audience scaling fee — flat bracket (NOT additive). */
export function audienceScalingFee(mandates: number): number {
  const pool = voterPool(mandates);
  for (const bracket of AUDIENCE_SCALING_BRACKETS) {
    if (pool <= bracket.upTo) return bracket.fee;
  }
  return AUDIENCE_SCALING_BRACKETS[AUDIENCE_SCALING_BRACKETS.length - 1].fee;
}

/**
 * THE single source of truth for the package monthly price.
 * Linear interpolation between 1/5/10 anchors, +₪1,000/mandate above 10,
 * + audience scaling fee.
 */
export function monthlyPackagePrice(mandates: number): number {
  const base = interpolateField(mandates, 'price', DYNAMIC_PRICE_PER_MANDATE);
  return base + audienceScalingFee(mandates);
}

/** Predicted target votes for a mandate count. */
export function predictedVotes(mandates: number): number {
  return Math.max(1, Math.floor(mandates)) * VOTES_PER_MANDATE;
}

/** Realistic supporters count for demo mode (≈45% of target by default). */
export function demoSupporters(mandates: number, supportRatio = 0.45): number {
  return Math.round(predictedVotes(mandates) * supportRatio);
}

/** Convenience aggregator: everything derived from a single mandate value. */
export interface DerivedQuota {
  mandates: number;
  aiVoiceMinutes: number;
  voterPool: number;
  seats: number;
  predictedVotes: number;
  monthlyPrice: number;
  monthlyBasePrice: number;
  audienceScalingFee: number;
}

export function deriveQuota(mandates: number): DerivedQuota {
  const m = Math.max(1, Math.floor(mandates));
  const fee = audienceScalingFee(m);
  const total = monthlyPackagePrice(m);
  return {
    mandates: m,
    aiVoiceMinutes: aiVoiceQuota(m),
    voterPool: voterPool(m),
    seats: seatsQuota(m),
    predictedVotes: predictedVotes(m),
    monthlyPrice: total,
    monthlyBasePrice: total - fee,
    audienceScalingFee: fee,
  };
}

// ───────────────────────── Back-compat shim (legacy bracket consumers) ─────────────────────────
// Some legacy code imports getBracket/QUOTA_BRACKETS. Provide a thin shim so we don't break builds.
// All real logic now flows through deriveQuota / monthlyPackagePrice / etc.

export interface QuotaBracket {
  minMandates: number;
  maxMandates: number;
  label: string;
  monthlyBasePrice: number;
  aiVoiceMinutes: number;
  voterPoolBase: number;
  audienceScalingFee: number;
}

export const QUOTA_BRACKETS: QuotaBracket[] = [
  { minMandates: 1,  maxMandates: 4,        label: 'מסלול פריצה',  monthlyBasePrice:  4_999, aiVoiceMinutes: 1_500, voterPoolBase:    50_000, audienceScalingFee: 0 },
  { minMandates: 5,  maxMandates: 9,        label: 'מסלול עוצמה',  monthlyBasePrice:  9_999, aiVoiceMinutes: 5_000, voterPoolBase:   250_000, audienceScalingFee: 0 },
  { minMandates: 10, maxMandates: Infinity, label: 'מסלול ניצחון', monthlyBasePrice: 14_999, aiVoiceMinutes: 7_000, voterPoolBase: 1_000_000, audienceScalingFee: 0 },
];

export function getBracket(mandates: number): QuotaBracket {
  const m = Math.max(1, Math.floor(mandates));
  return QUOTA_BRACKETS.find((b) => m >= b.minMandates && m <= b.maxMandates) ?? QUOTA_BRACKETS[QUOTA_BRACKETS.length - 1];
}
