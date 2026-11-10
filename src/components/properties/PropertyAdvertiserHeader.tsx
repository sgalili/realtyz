import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { normalizeListing } from '@/pages/PublicListingPage';
import { advertiserText } from '@/lib/advertiserIdentity';

/** Original advertiser from the same authorized projection used by property details. */
export default function PropertyAdvertiserHeader({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();
  const { data: fallback } = useQuery({
    queryKey: ['property-edit-brand-fallback', user?.id, activeWorkspaceId],
    enabled: !!user && !loading,
    queryFn: async () => {
      if (!user) return null;
      const [{ data: profile }, { data: brand }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('full_name,broker_license_number').eq('id', user.id).maybeSingle(),
        supabase.from('white_label_settings').select('agency_name,logo_url,landscape_logo_url').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('get_verified_user_roles'),
      ]);
      if (!(roles ?? []).some(role => ['agent', 'managing_broker', 'lead_agent', 'junior_agent'].includes(role))) return null;
      return { brokerName: advertiserText(profile?.full_name), officeName: advertiserText(brand?.agency_name), brokerLicenceNumber: advertiserText(profile?.broker_license_number), agencyLogoUrl: brand?.landscape_logo_url || brand?.logo_url || null };
    },
  });
  const { data: advertiser } = useQuery({
    queryKey: ['property-edit-advertiser', listingId, user?.id, activeWorkspaceId],
    enabled: !!listingId && !!user && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      // Unpublished/private listings have no public projection (404): show no header instead of crashing.
      if (error) return null;
      return data?.property ? normalizeListing(data.property, data.attribution) : null;
    },
  });
  const display = {
    officeName: advertiserText(advertiser?.officeName) || fallback?.officeName,
    brokerName: advertiserText(advertiser?.brokerName) || fallback?.brokerName,
    brokerLicenceNumber: advertiserText(advertiser?.brokerLicenceNumber) || fallback?.brokerLicenceNumber,
    agencyLogoUrl: advertiser?.agencyLogoUrl || fallback?.agencyLogoUrl,
  };
  if (!display.officeName && !display.brokerName && !display.agencyLogoUrl && !display.brokerLicenceNumber) return null;
  return <div data-testid="property-advertiser-header" className="flex min-w-0 items-center gap-3" dir="rtl">
    {display.agencyLogoUrl && <img src={display.agencyLogoUrl} alt={display.officeName || ''} className="h-12 w-16 shrink-0 object-contain" />}
    <div className="min-w-0 space-y-1">
      {display.officeName && <p className="break-words text-base font-semibold text-foreground">{display.officeName}</p>}
      {(display.brokerName || display.brokerLicenceNumber) && <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {display.brokerName && <span>{display.brokerName}</span>}
        {display.brokerLicenceNumber && <span dir="ltr">{display.brokerLicenceNumber}</span>}
      </p>}
    </div>
  </div>;
}