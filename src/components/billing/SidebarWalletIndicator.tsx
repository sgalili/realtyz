import { AlertTriangle, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreditWallet } from '@/hooks/useSubscription';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';

/** Untreated contacts = workspace contacts still at the "new" stage (or no stage yet). */
export function useUntreatedContactsCount() {
  const ws = useActiveWorkspaceOwnerId();
  const { isTeamMember, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, loading } = useUserRole();
  const allowed = !loading && isTeamMember && !isAffiliateOnly && !isPropertyOwnerOnly && !isPropertySeekerOnly;
  return useQuery({
    queryKey: ['untreated-contacts-count', ws],
    enabled: !!ws && allowed,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_owner_id', ws ?? '')
        .eq('is_demo', false)
        .or('lead_stage.is.null,lead_stage.in.(new,new_lead)');
      return count ?? 0;
    },
  }).data ?? 0;
}

/** Top of the sidebar: wallet balance (icon + amount → /wallet) and untreated-contacts counter. */
export function SidebarWalletIndicator() {
  const navigate = useNavigate();
  const { data, isLoading } = useCreditWallet();
  const untreated = useUntreatedContactsCount();
  const balance = Number(data?.balance ?? 0);
  const locked = !!data?.lockedAt;
  const { isTeamMember, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly } = useUserRole();
  const showContacts = isTeamMember && !isAffiliateOnly && !isPropertyOwnerOnly && !isPropertySeekerOnly;
  return (
    <div className={cn('mx-3 mb-3 grid gap-2', showContacts ? 'grid-cols-2' : 'grid-cols-1')}>
      <Button
        data-walkthrough="wallet"
        variant="outline"
        onClick={() => navigate('/wallet')}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg border px-2 py-2 transition-colors',
          locked ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-card hover:border-primary',
        )}
        aria-label={locked ? 'ארנק · נדרש תשלום' : 'ארנק ותשלומים'}
        title={locked ? 'נדרש תשלום' : 'ארנק ותשלומים'}
      >
        {locked ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Wallet className="h-4 w-4 text-primary" />}
        <bdi dir="ltr" className={cn('text-base font-bold', balance <= 0 && 'text-destructive')}>
          {isLoading ? '…' : `₪${Math.round(balance).toLocaleString('he-IL')}`}
        </bdi>
      </Button>
      {showContacts && <Button
        variant="outline"
        onClick={() => navigate('/lead-crm?filter=untreated')}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2 text-sm font-semibold transition-colors hover:border-primary"
        aria-label={`אנשי קשר שטרם טופלו: ${untreated}`}
        title="אנשי קשר שטרם טופלו"
      >
        <Users className="h-4 w-4 text-primary" />
        <span>חדשים</span>
        {untreated > 0 && (
          <span className="min-w-5 rounded-full bg-destructive px-1.5 text-xs font-bold leading-5 text-destructive-foreground">{untreated > 99 ? '99+' : untreated}</span>
        )}
      </Button>}
    </div>
  );
}
