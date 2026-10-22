import { useAuth } from '@/hooks/useAuth';
import { useAffiliateMarketplace, listingTiers } from '@/hooks/useAffiliate';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import LeadPricingDialog from '@/components/affiliate/LeadPricingDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CLOSING_SPLIT_EXPLANATION } from '@/components/affiliate/ClosingSplitNote';

export default function PropertyCommissionIcons({ listingId, raw, networkOpen }: { listingId: string; raw?: Record<string, unknown>; networkOpen?: boolean }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const marketplace = useAffiliateMarketplace();
  const { data: property } = useQuery({
    queryKey: ['public-commission-pricing', listingId, user?.id, level4Unlocked],
    enabled: !!user && networkOpen !== false && (!raw || (level4Unlocked && raw.affiliate_tier4_amount == null)) && !marketplace.data?.some((row) => row.listing_id === listingId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      if (error) throw error;
      return data?.property as Record<string, unknown> | undefined;
    },
  });
  // Closing commissions are a licensed-brokerage activity: only registered
  // brokers (verified license or broker roles, server-gated by
  // partner_can_view_closing) may see this column at all.
  if (!user) return null;
  if (networkOpen === false) return <span title="לפרסום באתר בלבד" className="block max-w-[7rem] truncate text-[11px] text-muted-foreground">לפרסום באתר בלבד</span>;
  const source = property ?? raw;
  const listing = marketplace.data?.find((row) => row.listing_id === listingId);
  const tiers = listing ? listingTiers(listing) : {
    tier1: Number(source?.affiliate_tier1_amount ?? 0),
    tier2: Number(source?.affiliate_tier2_amount ?? 0),
    tier3: Number(source?.affiliate_tier3_amount ?? 0),
    tier4: level4Unlocked ? Number(source?.affiliate_tier4_amount ?? 0) : 0,
    tier4Type: (source?.affiliate_tier4_type === 'percent' ? 'percent' : 'fixed') as 'percent' | 'fixed',
  };
  const showClosing = level4Unlocked && Number(tiers.tier4) > 0;
  if (!showClosing && Number(tiers.tier1) + Number(tiers.tier2) + Number(tiers.tier3) <= 0) return null;
  return <div className="max-w-[9rem] space-y-1 overflow-hidden"><LeadPricingDialog readOnly listing={listing ?? { listing_id: listingId, broker_id: '', property_title: null, tier1_amount: tiers.tier1, tier2_amount: tiers.tier2, tier3_amount: tiers.tier3, tier4_amount: tiers.tier4, tier4_type: tiers.tier4Type }} />{showClosing && <p title={CLOSING_SPLIT_EXPLANATION} className="text-[10px] font-normal leading-relaxed text-muted-foreground">* נטו למתווך: 80% · TORAFF: 20%</p>}</div>;
}
