// Affiliate network data layer.
//
// Two audiences share this file:
//   * Affiliates  – browse the broker-approved marketplace, create tracking
//                   referrals, follow their own rewards.
//   * Brokers     – flip properties into the marketplace, set the reward, and
//                   track every affiliate-generated lead + settlement.
//
// Security note: affiliates never query `listings` directly. The marketplace
// comes from the `get_affiliate_marketplace()` security-definer RPC, which
// returns a whitelisted set of public columns only (no owner contact data).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { publicUrl } from '@/lib/publicUrl';

export type RewardType = 'fixed' | 'percent';

export type ReferralStatus =
  | 'promoting'
  | 'clicked'
  | 'lead_captured'
  | 'qualified'
  | 'tour_scheduled'
  | 'deal_signed'
  | 'lost';

export type SettlementStatus = 'unsettled' | 'approved' | 'paid';

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  promoting: 'בשיווק',
  clicked: 'נכנסו לקישור',
  lead_captured: 'מתעניין נכנס',
  qualified: 'מתעניין מוסמך',
  tour_scheduled: 'סיור נקבע',
  deal_signed: 'עסקה נחתמה',
  lost: 'לא רלוונטי',
};

export const REFERRAL_STATUS_ORDER: ReferralStatus[] = [
  'promoting',
  'clicked',
  'lead_captured',
  'qualified',
  'tour_scheduled',
  'deal_signed',
  'lost',
];

export const SETTLEMENT_LABELS: Record<SettlementStatus, string> = {
  unsettled: 'ממתין להסדרה',
  approved: 'אושר לתשלום',
  paid: 'שולם',
};

export type MarketplaceListing = {
  listing_id: string;
  broker_id: string;
  property_title: string | null;
  address: string | null;
  city: string | null;
  deal_type: string | null;
  rooms: number | null;
  asking_price: number | null;
  image_url: string | null;
  media_photos: unknown;
  slug: string | null;
  reward_type: RewardType;
  reward_amount: number;
  approved_at: string | null;
  tier1_amount: number;
  tier2_amount: number;
  tier3_type: RewardType;
  tier3_amount: number;
};

export type AffiliateReferral = {
  id: string;
  affiliate_id: string;
  broker_id: string;
  listing_id: string | null;
  lead_id: string | null;
  tracking_code: string;
  channel: string | null;
  clicks: number;
  status: ReferralStatus;
  reward_type: RewardType;
  reward_amount: number;
  settlement_status: SettlementStatus;
  settled_at: string | null;
  notes: string | null;
  created_at: string;
};

/** Human-readable reward, e.g. "₪5,000" or "2.5% מהעסקה". */
export function formatReward(type: RewardType, amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!value) return 'טרם נקבע';
  if (type === 'percent') return `${value}% מהעמלה`;
  return `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

/** Resolves the ILS payout for a percent-based reward against a deal value. */
export function resolveRewardValue(
  type: RewardType,
  amount: number | null | undefined,
  dealValue: number | null | undefined,
): number | null {
  const value = Number(amount ?? 0);
  if (!value) return null;
  if (type === 'fixed') return value;
  if (!dealValue) return null;
  return Math.round((dealValue * value) / 100);
}

/** Tracking code: short, unambiguous, safe inside a URL. */
function newTrackingCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Public marketing link an affiliate shares. Always on our own domain. */
export function affiliateTrackingLink(slug: string | null, listingId: string, code: string): string {
  const path = slug ? `/p/${slug}` : `/p/${listingId}`;
  return publicUrl(`${path}?ref=${code}`);
}

// ---------------------------------------------------------------------------
// Affiliate side
// ---------------------------------------------------------------------------

/** Broker-approved properties open for affiliate marketing. */
export function useAffiliateMarketplace() {
  const { isAffiliate } = useUserRole();
  return useQuery({
    queryKey: ['affiliate-marketplace'],
    enabled: isAffiliate,
    staleTime: 60_000,
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data, error } = await supabase.rpc('get_affiliate_marketplace');
      if (error) throw error;
      return (data ?? []) as MarketplaceListing[];
    },
  });
}

/** The signed-in affiliate's own referrals (RLS scopes to affiliate_id). */
export function useMyReferrals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-my-referrals', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AffiliateReferral[]> => {
      const { data, error } = await supabase
        .from('affiliate_referrals')
        .select('*')
        .eq('affiliate_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AffiliateReferral[];
    },
  });
}

/** Self-service affiliate signup. Grants ONLY the `affiliate` role. */
export function useRegisterAffiliate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { displayName?: string; phone?: string }) => {
      const { error } = await supabase.rpc('register_as_affiliate', {
        _display_name: input.displayName ?? null,
        _phone: input.phone ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-marketplace'] });
    },
  });
}

/**
 * Starts promoting a property: creates the referral row and returns the
 * tracking link. Re-uses an existing referral for the same property so an
 * affiliate keeps one stable link per listing per channel.
 */
export function useStartPromoting() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { listing: MarketplaceListing; channel?: string }) => {
      const { listing, channel } = input;
      if (!user?.id) throw new Error('not_authenticated');

      const { data: existing } = await supabase
        .from('affiliate_referrals')
        .select('*')
        .eq('affiliate_id', user.id)
        .eq('listing_id', listing.listing_id)
        .eq('channel', channel ?? 'direct')
        .maybeSingle();

      if (existing) {
        const row = existing as AffiliateReferral;
        return { referral: row, link: affiliateTrackingLink(listing.slug, listing.listing_id, row.tracking_code) };
      }

      const code = newTrackingCode();
      const { data, error } = await supabase
        .from('affiliate_referrals')
        .insert({
          affiliate_id: user.id,
          broker_id: listing.broker_id,
          listing_id: listing.listing_id,
          tracking_code: code,
          channel: channel ?? 'direct',
          status: 'promoting',
          // Snapshot the promised reward so a later broker change cannot
          // retroactively shrink what this affiliate was offered.
          reward_type: listing.reward_type,
          reward_amount: listing.reward_amount,
        })
        .select('*')
        .single();
      if (error) throw error;
      const row = data as AffiliateReferral;
      return { referral: row, link: affiliateTrackingLink(listing.slug, listing.listing_id, row.tracking_code) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-my-referrals'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Broker side
// ---------------------------------------------------------------------------

export type BrokerAffiliateListing = {
  id: string;
  property_title: string | null;
  address: string | null;
  city: string | null;
  deal_type: string | null;
  asking_price: number | null;
  image_url: string | null;
  status: string | null;
  affiliate_enabled: boolean;
  affiliate_reward_type: RewardType;
  affiliate_reward_amount: number;
  affiliate_approved_at: string | null;
  affiliate_tier1_amount: number;
  affiliate_tier2_amount: number;
  affiliate_tier3_type: RewardType;
  affiliate_tier3_amount: number;
};

/** Workspace properties with their affiliate marketing configuration. */
export function useBrokerAffiliateListings() {
  const ownerId = useActiveWorkspaceOwnerId();
  return useQuery({
    queryKey: ['broker-affiliate-listings', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<BrokerAffiliateListing[]> => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, property_title, address, city, deal_type, asking_price, image_url, status, affiliate_enabled, affiliate_reward_type, affiliate_reward_amount, affiliate_approved_at, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_type, affiliate_tier3_amount',
        )
        .eq('user_id', ownerId!)
        .order('affiliate_enabled', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BrokerAffiliateListing[];
    },
  });
}

/** Broker sets / clears the reward + 3-tier payouts offered per property. */
export function useSetAffiliateReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      enabled: boolean;
      rewardType: RewardType;
      rewardAmount: number;
      tier1Amount?: number;
      tier2Amount?: number;
      tier3Type?: RewardType;
      tier3Amount?: number;
    }) => {
      const patch = {
        affiliate_enabled: input.enabled,
        affiliate_reward_type: input.rewardType,
        affiliate_reward_amount: input.rewardAmount,
        affiliate_approved_at: input.enabled ? new Date().toISOString() : null,
        affiliate_tier1_amount: input.tier1Amount ?? 0,
        affiliate_tier2_amount: input.tier2Amount ?? 0,
        affiliate_tier3_type: input.tier3Type ?? 'fixed',
        affiliate_tier3_amount: input.tier3Amount ?? 0,
      };

      const { error } = await supabase.from('listings').update(patch).eq('id', input.listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-affiliate-listings'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-marketplace'] });
    },
  });
}

export type BrokerReferralRow = AffiliateReferral & {
  listing?: { property_title: string | null; address: string | null; city: string | null } | null;
  lead?: { id: string; full_name: string | null; phone: string | null; status: string | null } | null;
  affiliate?: { display_name: string | null; phone: string | null } | null;
};

/** Every affiliate-generated referral for the active workspace. */
export function useBrokerReferrals() {
  const ownerId = useActiveWorkspaceOwnerId();
  return useQuery({
    queryKey: ['broker-affiliate-referrals', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<BrokerReferralRow[]> => {
      const { data, error } = await supabase
        .from('affiliate_referrals')
        .select('*')
        .eq('broker_id', ownerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as AffiliateReferral[];
      if (rows.length === 0) return [];

      const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))] as string[];
      const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
      const affiliateIds = [...new Set(rows.map((r) => r.affiliate_id))];

      const [listingsRes, leadsRes, affiliatesRes] = await Promise.all([
        listingIds.length
          ? supabase.from('listings').select('id, property_title, address, city').in('id', listingIds)
          : Promise.resolve({ data: [] as any[] }),
        leadIds.length
          ? supabase.from('leads').select('id, full_name, phone, status').in('id', leadIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('affiliate_profiles').select('user_id, display_name, phone').in('user_id', affiliateIds),
      ]);

      const listingMap = new Map((listingsRes.data ?? []).map((l: any) => [l.id, l]));
      const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
      const affiliateMap = new Map((affiliatesRes.data ?? []).map((a: any) => [a.user_id, a]));

      return rows.map((r) => ({
        ...r,
        listing: r.listing_id ? listingMap.get(r.listing_id) ?? null : null,
        lead: r.lead_id ? leadMap.get(r.lead_id) ?? null : null,
        affiliate: affiliateMap.get(r.affiliate_id) ?? null,
      }));
    },
  });
}

/** Broker moves a referral along the funnel / settles the payout. */
export function useUpdateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: ReferralStatus;
      settlementStatus?: SettlementStatus;
      rewardAmount?: number;
      notes?: string;
    }) => {
      const patch: {
        status?: ReferralStatus;
        settlement_status?: SettlementStatus;
        settled_at?: string | null;
        reward_amount?: number;
        notes?: string;
      } = {};
      if (input.status) patch.status = input.status;
      if (input.settlementStatus) {
        patch.settlement_status = input.settlementStatus;
        patch.settled_at = input.settlementStatus === 'paid' ? new Date().toISOString() : null;
      }
      if (input.rewardAmount !== undefined) patch.reward_amount = input.rewardAmount;
      if (input.notes !== undefined) patch.notes = input.notes;

      const { error } = await supabase.from('affiliate_referrals').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-affiliate-referrals'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-my-referrals'] });
    },
  });
}

// ---------------------------------------------------------------------------
// 3-tier commissions + affiliate lead submissions
// ---------------------------------------------------------------------------

export type SubmissionStatus = 'submitted' | 'verified' | 'closed' | 'rejected';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: 'הוגש',
  verified: 'אומת',
  closed: 'עסקה נסגרה',
  rejected: 'נדחה',
};

export const SUBMISSION_STATUS_ORDER: SubmissionStatus[] = ['submitted', 'verified', 'closed', 'rejected'];

export type CommissionTiers = {
  tier1: number;
  tier2: number;
  tier3Type: RewardType;
  tier3: number;
};

/** Tier labels shown on every marketplace card. */
export const TIER_LABELS = {
  tier1: 'שלב 1 · ליד חם שהוגש',
  tier2: 'שלב 2 · ליד שאומת אנושית',
  tier3: 'שלב 3 · בונוס סגירת עסקה',
} as const;

/** Reads the tiers off a marketplace row, defaulting tier 2 to double tier 1. */
export function listingTiers(listing: MarketplaceListing): CommissionTiers {
  const tier1 = Number(listing.tier1_amount ?? 0);
  const tier2Raw = Number(listing.tier2_amount ?? 0);
  return {
    tier1,
    tier2: tier2Raw || tier1 * 2,
    tier3Type: (listing.tier3_type ?? 'fixed') as RewardType,
    tier3: Number(listing.tier3_amount ?? 0),
  };
}

export type AffiliateLeadSubmission = {
  id: string;
  affiliate_id: string;
  broker_id: string;
  listing_id: string | null;
  referral_id: string | null;
  lead_id: string | null;
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  notes: string | null;
  status: SubmissionStatus;
  tier1_amount: number;
  tier2_amount: number;
  tier3_type: RewardType;
  tier3_amount: number;
  earned_amount: number;
  settlement_status: SettlementStatus;
  verified_at: string | null;
  closed_at: string | null;
  created_at: string;
};

/**
 * Accumulated payout for a submission at its current stage.
 * submitted → tier1, verified → tier1 + tier2, closed → + tier3 (fixed only).
 */
export function accruedEarnings(row: {
  status: SubmissionStatus;
  tier1_amount: number;
  tier2_amount: number;
  tier3_type: RewardType;
  tier3_amount: number;
}): number {
  if (row.status === 'rejected') return 0;
  let total = Number(row.tier1_amount ?? 0);
  if (row.status === 'verified' || row.status === 'closed') total += Number(row.tier2_amount ?? 0);
  if (row.status === 'closed' && row.tier3_type === 'fixed') total += Number(row.tier3_amount ?? 0);
  return total;
}

export type AffiliateSubmissionRow = AffiliateLeadSubmission & {
  listing?: { property_title: string | null; address: string | null; city: string | null } | null;
  affiliate?: { display_name: string | null; phone: string | null } | null;
};

async function hydrateSubmissions(rows: AffiliateLeadSubmission[]): Promise<AffiliateSubmissionRow[]> {
  if (rows.length === 0) return [];
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))] as string[];
  const affiliateIds = [...new Set(rows.map((r) => r.affiliate_id))];
  const [listingsRes, affRes] = await Promise.all([
    listingIds.length
      ? supabase.from('listings').select('id, property_title, address, city').in('id', listingIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from('affiliate_profiles').select('user_id, display_name, phone').in('user_id', affiliateIds),
  ]);
  const listingMap = new Map(((listingsRes.data ?? []) as Record<string, never>[]).map((l) => [l['id'], l]));
  const affMap = new Map(((affRes.data ?? []) as Record<string, never>[]).map((a) => [a['user_id'], a]));
  return rows.map((r) => ({
    ...r,
    listing: r.listing_id ? (listingMap.get(r.listing_id) as AffiliateSubmissionRow['listing']) ?? null : null,
    affiliate: (affMap.get(r.affiliate_id) as AffiliateSubmissionRow['affiliate']) ?? null,
  }));
}

/** Submissions created by the signed-in affiliate. */
export function useMySubmissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-my-submissions', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AffiliateSubmissionRow[]> => {
      const { data, error } = await supabase
        .from('affiliate_lead_submissions')
        .select('*')
        .eq('affiliate_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return hydrateSubmissions((data ?? []) as AffiliateLeadSubmission[]);
    },
  });
}

/** Submissions received by the active broker workspace. */
export function useBrokerSubmissions() {
  const ownerId = useActiveWorkspaceOwnerId();
  return useQuery({
    queryKey: ['broker-affiliate-submissions', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<AffiliateSubmissionRow[]> => {
      const { data, error } = await supabase
        .from('affiliate_lead_submissions')
        .select('*')
        .eq('broker_id', ownerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return hydrateSubmissions((data ?? []) as AffiliateLeadSubmission[]);
    },
  });
}

/** Affiliate submits a warm lead against a marketplace property. */
export function useSubmitAffiliateLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      listing: MarketplaceListing;
      leadName: string;
      leadPhone?: string;
      leadEmail?: string;
      notes?: string;
      referralId?: string | null;
    }) => {
      if (!user?.id) throw new Error('not_authenticated');
      const tiers = listingTiers(input.listing);
      const { data, error } = await supabase
        .from('affiliate_lead_submissions')
        .insert({
          affiliate_id: user.id,
          broker_id: input.listing.broker_id,
          listing_id: input.listing.listing_id,
          referral_id: input.referralId ?? null,
          lead_name: input.leadName,
          lead_phone: input.leadPhone || null,
          lead_email: input.leadEmail || null,
          notes: input.notes || null,
          status: 'submitted',
          tier1_amount: tiers.tier1,
          tier2_amount: tiers.tier2,
          tier3_type: tiers.tier3Type,
          tier3_amount: tiers.tier3,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as AffiliateLeadSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-my-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['broker-affiliate-submissions'] });
    },
  });
}

/** Broker advances a submission through the stages and settles the payout. */
export function useUpdateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      row: AffiliateSubmissionRow;
      status?: SubmissionStatus;
      settlementStatus?: SettlementStatus;
    }) => {
      const next: SubmissionStatus = input.status ?? input.row.status;
      const patch = {
        status: next,
        settlement_status: input.settlementStatus ?? input.row.settlement_status,
        earned_amount: accruedEarnings({ ...input.row, status: next }),
        verified_at:
          next === 'verified' || next === 'closed'
            ? input.row.verified_at ?? new Date().toISOString()
            : null,
        closed_at: next === 'closed' ? input.row.closed_at ?? new Date().toISOString() : null,
      };
      const { error } = await supabase
        .from('affiliate_lead_submissions')
        .update(patch)
        .eq('id', input.row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-affiliate-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-my-submissions'] });
    },
  });
}
