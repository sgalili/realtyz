import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/** Broker/office clicks open the office page only when the office has more than one broker; otherwise the broker's own profile. */
export function identityPath(userId: string, rosterSize: number | null | undefined) {
  return `/community/${(rosterSize ?? 0) > 1 ? 'office' : 'profile'}/${encodeURIComponent(userId)}`;
}

function useOfficeRosterSize(userId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['office-roster-size', user?.id, userId],
    enabled: !!user && !!userId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_office_roster_size', { _user: userId! });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });
}

/** Identity links never activate the surrounding property row or card. `exactOffice` keeps an explicit "office page" link. */
export function PublicIdentityLink({ userId, office = false, exactOffice = false, children, className, label }: { userId?: string | null; office?: boolean; exactOffice?: boolean; children: ReactNode; className?: string; label?: string }) {
  const { data: rosterSize } = useOfficeRosterSize(exactOffice ? null : userId);
  if (!userId) return <span className={className}>{children}</span>;
  const to = exactOffice ? `/community/office/${encodeURIComponent(userId)}` : identityPath(userId, rosterSize);
  void office;
  return <Link to={to} aria-label={label} className={cn('rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{children}</Link>;
}
