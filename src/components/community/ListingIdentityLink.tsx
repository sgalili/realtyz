import type { ReactNode } from 'react';
import { useListingProfileTargets } from '@/hooks/useListingProfileTargets';
import { PublicIdentityLink } from './PublicIdentityLink';

export function ListingIdentityLink({ listingId, office = false, children, className, label }: { listingId?: string | null; office?: boolean; children: ReactNode; className?: string; label?: string }) {
  if (!listingId) return <span className={className}>{children}</span>;
  return <ResolvedListingIdentityLink listingId={listingId} office={office} className={className} label={label}>{children}</ResolvedListingIdentityLink>;
}

function ResolvedListingIdentityLink({ listingId, office, children, className, label }: { listingId: string; office: boolean; children: ReactNode; className?: string; label?: string }) {
  const { data } = useListingProfileTargets(listingId);
  return <PublicIdentityLink userId={office ? data?.office_user_id : data?.profile_user_id} office={office} className={className} label={label}>{children}</PublicIdentityLink>;
}