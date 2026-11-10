import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { normalizeListing } from '@/pages/PublicListingPage';

/** Original advertiser from the same authorized projection used by property details. */
export default function PropertyAdvertiserHeader({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();
  const { data: advertiser } = useQuery({
    queryKey: ['property-edit-advertiser', listingId, user?.id, activeWorkspaceId],
    enabled: !!listingId && !!user && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      if (error) throw error;
      return data?.property ? normalizeListing(data.property, data.attribution) : null;
    },
  });
  if (!advertiser || (!advertiser.officeName && !advertiser.brokerName)) return null;
  return <div data-testid="property-advertiser-header" className="flex min-w-0 items-center gap-3" dir="rtl">
    {advertiser.agencyLogoUrl && <img src={advertiser.agencyLogoUrl} alt={advertiser.officeName || ''} className="h-12 w-16 shrink-0 object-contain" />}
    <div className="min-w-0 space-y-1">
      {advertiser.officeName && <p className="break-words text-base font-semibold text-foreground">{advertiser.officeName}</p>}
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {advertiser.brokerName && <span>{advertiser.brokerName}</span>}
        {advertiser.brokerLicenceNumber && <span dir="ltr">{advertiser.brokerLicenceNumber}</span>}
      </p>
    </div>
  </div>;
}