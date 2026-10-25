import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeListing } from '@/pages/PublicListingPage';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import PublicAdHeading from './PublicAdHeading';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import { useAuth } from '@/hooks/useAuth';
import PropertyCommissionIcons from './PropertyCommissionIcons';
import { useWorkspace } from '@/hooks/useWorkspace';

export function PublicCardPublisher({ card }: { card: PublicCard }) {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', card.slug || card.id, user?.id, activeWorkspaceId],
    enabled: !user || !loading,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(card.slug || card.id)}`, { method: 'GET' });
      if (error || !payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Record<string, unknown> };
    },
  });
  const publisher = card.attribution;
  return <BrokerAttribution table compact brokerName={publisher?.broker_name ?? data?.listing.brokerName} officeName={publisher?.office_name ?? data?.listing.officeName} logoUrl={publisher?.agency_logo_url ?? data?.listing.agencyLogoUrl} publisherKind={publisher?.publisher_kind ?? data?.listing.publisherKind} dealType={card.deal_type} />;
}

export default function PublicCardSummary({ card, price, showBroker = true, showCommissions = true, dense = false }: { card: PublicCard; price?: string; showBroker?: boolean; showCommissions?: boolean; dense?: boolean }) {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', card.slug || card.id, user?.id, activeWorkspaceId],
    enabled: !user || !loading,
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
    {showBroker && <BrokerAttribution compact brokerName={publisher?.broker_name ?? data?.listing.brokerName} officeName={publisher?.office_name ?? data?.listing.officeName} licenceNumber={publisher?.broker_license_number ?? data?.listing.brokerLicenceNumber} logoUrl={publisher?.agency_logo_url ?? data?.listing.agencyLogoUrl} publisherKind={publisher?.publisher_kind ?? data?.listing.publisherKind} dealType={card.deal_type} trailing={showCommissions ? <PropertyCommissionIcons listingId={card.id} raw={data?.raw ?? { reward_types: card.reward_types, closing_level: card.closing_level }} /> : undefined} />}
  </div>;
}