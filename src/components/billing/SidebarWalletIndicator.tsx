import { AlertTriangle, ContactRound, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreditWallet } from '@/hooks/useSubscription';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { fmtCompactCredits, ilsToCredits } from '@/lib/credits';
import { useAuth } from '@/hooks/useAuth';

/** Incoming leads = inquiries that arrived here. A partner's own sent leads never count as incoming. */
export function useIncomingLeadsCount() {
  const { isPartnerMode } = useAppMode();
  const ws = useActiveWorkspaceOwnerId();
  const { user } = useAuth();
  const { isTeamMember, isDeveloper, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, loading, error } = useUserRole();
  const partner = isPartnerMode || isAffiliateOnly;
  const allowed = !loading && !error && !isPropertySeekerOnly && (partner || isTeamMember || isDeveloper || isPropertyOwnerOnly);
  return useQuery({
    queryKey: ['incoming-leads-count', ws, user?.id, partner, isPropertyOwnerOnly],
    enabled: !!user && !!ws && allowed,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (partner) {
        const { data, error } = await supabase.rpc('get_affiliate_contacts');
        if (error) throw error;
        return (data ?? []).filter((lead: { submission_status?: string | null }) => !lead.submission_status).length;
      }
      if (isPropertyOwnerOnly) {
        const { count, error } = await supabase.from('public_listing_interest').select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count ?? 0;
      }
      const { count, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_owner_id', ws ?? '')
        .eq('is_demo', false);
      if (error) throw error;
      return count ?? 0;
    },
  }).data ?? 0;
}

/** Top of the sidebar: wallet balance (icon + amount → /wallet) and untreated-contacts counter. */
export function SidebarWalletIndicator() {
  const { isPartnerMode } = useAppMode();
  const navigate = useNavigate();
  const { setOpen, setOpenMobile } = useSidebar();
  const go = (path: string) => { setOpenMobile(false); setOpen(false); navigate(path); };
  const { data, isLoading } = useCreditWallet();
  const incoming = useIncomingLeadsCount();
  const balance = Number(data?.balance ?? 0);
  const locked = !!data?.lockedAt;
  const { isTeamMember, isDeveloper, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, loading, error } = useUserRole();
  const showContacts = !loading && !error && !isPropertySeekerOnly && (isPartnerMode || isAffiliateOnly || isTeamMember || isDeveloper || isPropertyOwnerOnly);
  const leadsPath = isPartnerMode || isAffiliateOnly ? '/partner/contacts' : isPropertyOwnerOnly ? '/owner/leads' : '/lead-crm';
  return (
    <div data-sidebar="balance-controls" className={cn('mx-3 mb-[15px] grid gap-2', showContacts ? 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : 'grid-cols-1')}>
      <Button
        data-walkthrough="wallet"
        variant="outline"
        onClick={() => go('/wallet')}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg border px-2 py-2 transition-colors',
          locked ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-card hover:border-primary',
        )}
        aria-label={locked ? 'ארנק · נדרש תשלום' : 'ארנק ותשלומים'}
        title={locked ? 'נדרש תשלום' : 'ארנק ותשלומים'}
      >
        {locked ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> : <Wallet className="h-4 w-4 shrink-0 text-[hsl(var(--nav-wallet))]" />}
        <span className={cn('min-w-0 whitespace-normal text-sm font-bold leading-tight', balance <= 0 && 'text-destructive')}>
          {isLoading ? '…' : fmtCompactCredits(ilsToCredits(balance))}
        </span>
      </Button>
      {showContacts && <Button
        variant="outline"
        onClick={() => go(leadsPath)}
        className="flex min-w-0 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-1 py-2 text-sm font-semibold transition-colors hover:border-primary"
        aria-label={`לידים שהתקבלו: ${incoming}`}
        title="לידים שהתקבלו"
      >
        <ContactRound className="h-4 w-4 shrink-0 text-[hsl(var(--nav-new-contacts))]" />
        <span aria-label="מספר לידים שהתקבלו" className={cn('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold', incoming > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')}>{incoming > 99 ? '99+' : incoming}</span>
        <span className="min-w-0 whitespace-normal leading-tight">לידים</span>
      </Button>}
    </div>
  );
}
