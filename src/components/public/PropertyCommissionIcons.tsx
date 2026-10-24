import { useAuth } from '@/hooks/useAuth';
import { useAffiliateMarketplace, listingTiers } from '@/hooks/useAffiliate';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import LeadPricingDialog from '@/components/affiliate/LeadPricingDialog';
import { RewardIcons, type RewardTypes } from '@/components/affiliate/CommissionTierBadges';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tableRoyalties } from '@/lib/tableRoyalties';

export default function PropertyCommissionIcons({ listingId, raw, networkOpen, table = false }: { listingId: string; raw?: Record<string, unknown>; networkOpen?: boolean; table?: boolean }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const marketplace = useAffiliateMarketplace();
  const { data: property } = useQuery({
    queryKey: ['public-commission-pricing', listingId, user?.id, level4Unlocked],
    enabled: networkOpen !== false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      if (error) throw error;
      return data?.property as Record<string, unknown> | undefined;
    },
  });
  if (networkOpen === false) return null;
  const source = property ?? raw;
  const listing = marketplace.data?.find(row => row.listing_id === listingId);
  const tiers = !property && listing ? listingTiers(listing) : {
    tier1: Number(source?.affiliate_tier1_amount ?? 0), tier2: Number(source?.affiliate_tier2_amount ?? 0),
    tier3: Number(source?.affiliate_tier3_amount ?? 0), tier4: level4Unlocked ? Number(source?.affiliate_tier4_amount ?? 0) : 0,
    tier4Type: (source?.affiliate_tier4_type === 'percent' ? 'percent' : 'fixed') as 'percent' | 'fixed',
  };
  const types: RewardTypes = { ...(source?.reward_types as RewardTypes ?? { form: tiers.tier1 > 0, whatsapp: tiers.tier2 > 0, phone: tiers.tier3 > 0 }), closing: true };
  const display = table ? tableRoyalties(types, tiers, !!user, level4Unlocked) : { types, prices: undefined };
  if (!Object.values(display.types).some(Boolean)) return null;
  return <LeadPricingDialog readOnly rewardTypes={display.types} listing={{ listing_id: listingId, broker_id: '', property_title: null, tier1_amount: tiers.tier1, tier2_amount: tiers.tier2, tier3_amount: tiers.tier3, tier4_amount: tiers.tier4, tier4_type: tiers.tier4Type }}><RewardIcons types={display.types} prices={display.prices} closingPercent={tiers.tier4Type === 'percent'} label={table ? null : 'תגמולים'} grid={table} /></LeadPricingDialog>;
}
