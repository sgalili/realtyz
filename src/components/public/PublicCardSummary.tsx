import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeListing } from '@/pages/PublicListingPage';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import PublicAdHeading from './PublicAdHeading';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { PublicCard } from '@/pages/PublicListingsBoard';

export default function PublicCardSummary({ card, price, showBroker = true, dense = false }: { card: PublicCard; price?: string; showBroker?: boolean; dense?: boolean }) {
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', card.slug || card.id],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(card.slug || card.id)}`, { method: 'GET' });
      if (error || !payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Record<string, unknown> };
    },
  });
  return <div className="space-y-2">
    <PublicAdHeading compact dense={dense} title={data?.listing.title || publicAdTitle(card)} price={price} dealType={card.deal_type} />
    {showBroker && <BrokerAttribution compact brokerName={data?.listing.brokerName} officeName={data?.listing.officeName} licenceNumber={data?.listing.brokerLicenceNumber} logoUrl={data?.listing.agencyLogoUrl} />}
  </div>;
}