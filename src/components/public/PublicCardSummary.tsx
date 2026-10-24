import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeListing } from '@/pages/PublicListingPage';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import PublicAdHeading from './PublicAdHeading';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import PropertyCommissionIcons from './PropertyCommissionIcons';
import { listingDistribution } from '@/lib/homeActivity';

export function PublicCardPublisher({ card }: { card: PublicCard }) {
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', card.slug || card.id],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(card.slug || card.id)}`, { method: 'GET' });
      if (error || !payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Record<string, unknown> };
    },
  });
  const publisher = card.attribution;
  return <BrokerAttribution compact brokerName={publisher?.broker_name ?? data?.listing.brokerName} officeName={publisher?.office_name ?? data?.listing.officeName} licenceNumber={publisher?.broker_license_number ?? data?.listing.brokerLicenceNumber} logoUrl={publisher?.agency_logo_url ?? data?.listing.agencyLogoUrl} publisherKind={publisher?.publisher_kind ?? data?.listing.publisherKind} dealType={card.deal_type} />;
}

export default function PublicCardSummary({ card, price, showBroker = true, showCommissions = true, dense = false }: { card: PublicCard; price?: string; showBroker?: boolean; showCommissions?: boolean; dense?: boolean }) {
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', card.slug || card.id],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(card.slug || card.id)}`, { method: 'GET' });
      if (error || !payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Record<string, unknown> };
    },
  });
  const publisher = card.attribution;
  return <div className="space-y-2">
    <PublicAdHeading compact dense={dense} title={data?.listing.title || publicAdTitle(card)} price={price} dealType={card.deal_type} />
    {!dense && <span className={listingDistribution(card.affiliate_enabled === true) === 'network' ? 'inline-flex text-[11px] font-semibold text-success' : 'inline-flex text-[11px] text-muted-foreground'}>{card.affiliate_enabled ? 'פתוח לרשת השותפים' : 'פרסום באתר בלבד'}</span>}
    {showBroker && <BrokerAttribution compact brokerName={publisher?.broker_name ?? data?.listing.brokerName} officeName={publisher?.office_name ?? data?.listing.officeName} licenceNumber={publisher?.broker_license_number ?? data?.listing.brokerLicenceNumber} logoUrl={publisher?.agency_logo_url ?? data?.listing.agencyLogoUrl} publisherKind={publisher?.publisher_kind ?? data?.listing.publisherKind} dealType={card.deal_type} trailing={showCommissions ? <PropertyCommissionIcons listingId={card.id} raw={data?.raw ?? { reward_types: card.reward_types }} networkOpen={card.affiliate_enabled} /> : undefined} />}
  </div>;
}