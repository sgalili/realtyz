// Shared "lead type + lead value" filter used by every partner screen.
//
// A property offers a lead type only when the publisher priced that tier:
//   tier1 digital lead · tier2 WhatsApp screening · tier3 phone call ·
//   tier4 deal closing (licensed brokers only).
export type LeadTypeKey = 'tier1' | 'tier2' | 'tier3' | 'tier4';

export const LEAD_TYPE_LABELS: Record<LeadTypeKey, string> = {
  tier1: 'ליד דיגיטלי',
  tier2: 'סינון בווטסאפ',
  tier3: 'שיחת טלפון',
  tier4: 'סגירת עסקה',
};

export const LEAD_TYPE_ORDER: LeadTypeKey[] = ['tier1', 'tier2', 'tier3', 'tier4'];

export type LeadTierAmounts = Record<LeadTypeKey, number>;

export type LeadFilterState = {
  types: LeadTypeKey[];
  min: number | null;
  max: number | null;
};

export const EMPTY_LEAD_FILTER: LeadFilterState = { types: [], min: null, max: null };

export function leadFilterActiveCount(state: LeadFilterState): number {
  return state.types.length + (state.min != null ? 1 : 0) + (state.max != null ? 1 : 0);
}

/** Tier amounts off any listing-shaped row (broker rows or marketplace rows). */
export function leadTierAmounts(row: Record<string, unknown> | null | undefined): LeadTierAmounts {
  const num = (...keys: string[]): number => {
    for (const key of keys) {
      const value = row?.[key];
      if (value != null && value !== '') return Number(value) || 0;
    }
    return 0;
  };
  return {
    tier1: num('affiliate_tier1_amount', 'tier1_amount'),
    tier2: num('affiliate_tier2_amount', 'tier2_amount'),
    tier3: num('affiliate_tier3_amount', 'tier3_amount'),
    tier4: num('affiliate_tier4_amount', 'tier4_amount'),
  };
}

/**
 * A row passes when it offers at least one of the selected lead types (all
 * priced types when none is selected) and the value of one of those leads
 * falls inside the requested range.
 */
export function matchesLeadFilter(amounts: LeadTierAmounts, state: LeadFilterState): boolean {
  const keys = state.types.length ? state.types : LEAD_TYPE_ORDER;
  const values = keys.map((key) => amounts[key]).filter((value) => value > 0);
  if (state.types.length && values.length === 0) return false;
  if (state.min == null && state.max == null) return true;
  if (values.length === 0) return false;
  return values.some((value) =>
    (state.min == null || value >= state.min) && (state.max == null || value <= state.max));
}
