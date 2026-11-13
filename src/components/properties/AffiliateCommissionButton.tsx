import { useQueryClient } from '@tanstack/react-query';
import { QuickPublicPromotion } from './QuickPublicPromotion';

/** Partner activation shares the required inventory pricing/confirmation flow. */
export function AffiliateCommissionButton({ listingId, shared }: { listingId: string; shared?: boolean }) {
  const client = useQueryClient();
  return <QuickPublicPromotion ids={[listingId]} compact statusLive={shared} onPublished={() => {
    void client.invalidateQueries({ queryKey: ['affiliate-listing-config', listingId] });
    void client.invalidateQueries({ queryKey: ['properties-search'] });
  }} />;
}