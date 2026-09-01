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
          'id, property_title, address, city, deal_type, asking_price, image_url, status, affiliate_enabled, affiliate_reward_type, affiliate_reward_amount, affiliate_approved_at',
        )
        .eq('user_id', ownerId!)
        .order('affiliate_enabled', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BrokerAffiliateListing[];
    },
  });
}

/** Broker sets / clears the reward offered per property. */
export function useSetAffiliateReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      enabled: boolean;
      rewardType: RewardType;
      rewardAmount: number;
    }) => {
      const { error } = await supabase
        .from('listings')
        .update({
          affiliate_enabled: input.enabled,
          affiliate_reward_type: input.rewardType,
          affiliate_reward_amount: input.rewardAmount,
          affiliate_approved_at: input.enabled ? new Date().toISOString() : null,
        })
        .eq('id', input.listingId);
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
