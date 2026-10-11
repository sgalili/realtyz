import { useAuth } from '@/hooks/useAuth';
import { useAffiliateMarketplace, listingTiers } from '@/hooks/useAffiliate';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';

export default function PropertyCommissionIcons({ listingId, raw }: { listingId: string; raw?: Record<string, unknown> }) {
  const { user } = useAuth();
  const marketplace = useAffiliateMarketplace();
  if (!user) return null;
  const listing = marketplace.data?.find((row) => row.listing_id === listingId);
  const tiers = listing ? listingTiers(listing) : {
    tier1: Number(raw?.affiliate_tier1_amount ?? 0),
    tier2: Number(raw?.affiliate_tier2_amount ?? 0),
    tier3: Number(raw?.affiliate_tier3_amount ?? 0),
    tier4: 0,
    tier4Type: 'fixed' as const,
  };
  return <CommissionTierBadges tiers={tiers} compact />;
}