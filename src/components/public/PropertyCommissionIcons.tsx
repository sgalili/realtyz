import { useAuth } from '@/hooks/useAuth';
import { useAffiliateMarketplace, listingTiers } from '@/hooks/useAffiliate';
import LeadPricingDialog from '@/components/affiliate/LeadPricingDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function PropertyCommissionIcons({ listingId, raw }: { listingId: string; raw?: Record<string, unknown> }) {
  const { user } = useAuth();
  const marketplace = useAffiliateMarketplace();
  const { data: property } = useQuery({
    queryKey: ['public-commission-pricing', listingId],
    enabled: !!user && !raw && !marketplace.data?.some((row) => row.listing_id === listingId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      if (error) throw error;
      return data?.property as Record<string, unknown> | undefined;
    },
  });
  if (!user) return null;
  const source = raw ?? property;
  const listing = marketplace.data?.find((row) => row.listing_id === listingId);
  const tiers = listing ? listingTiers(listing) : {
    tier1: Number(source?.affiliate_tier1_amount ?? 0),
    tier2: Number(source?.affiliate_tier2_amount ?? 0),
    tier3: Number(source?.affiliate_tier3_amount ?? 0),
    tier4: 0,
    tier4Type: 'fixed' as const,
  };
  if (![tiers.tier1, tiers.tier2, tiers.tier3, tiers.tier4].some((value) => value > 0)) return null;
  return <LeadPricingDialog readOnly listing={listing ?? { listing_id: listingId, broker_id: '', property_title: null, tier1_amount: tiers.tier1, tier2_amount: tiers.tier2, tier3_amount: tiers.tier3, tier4_amount: tiers.tier4, tier4_type: tiers.tier4Type }} />;
}