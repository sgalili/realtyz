import { AlertTriangle, Users, Wallet, CircleHelp } from 'lucide-react';
import { useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { fmtCredits, ilsToCredits } from '@/lib/credits';

/** Untreated contacts = workspace contacts still at the "new" stage (or no stage yet). */
export function useUntreatedContactsCount() {
  const { isPartnerMode } = useAppMode();
  const ws = useActiveWorkspaceOwnerId();
  const { isTeamMember, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, loading } = useUserRole();
   const allowed = !loading && !isPartnerMode && isTeamMember && !isAffiliateOnly && !isPropertyOwnerOnly && !isPropertySeekerOnly;
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
  const { isPartnerMode } = useAppMode();
  const navigate = useNavigate();
  const { setOpen, setOpenMobile } = useSidebar();
  const [explanation, setExplanation] = useState(false);
  const go = (path: string) => { setOpenMobile(false); setOpen(false); navigate(path); };
  const { data, isLoading } = useCreditWallet();
  const untreated = useUntreatedContactsCount();
  const balance = Number(data?.balance ?? 0);
  const locked = !!data?.lockedAt;
  const { isTeamMember, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly } = useUserRole();
  const showContacts = !isPartnerMode && isTeamMember && !isAffiliateOnly && !isPropertyOwnerOnly && !isPropertySeekerOnly;
  return (
    <><div className={cn('mx-3 mb-3 grid gap-2', showContacts ? 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : 'grid-cols-1')}>
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
          {isLoading ? '…' : fmtCredits(ilsToCredits(balance))}
        </span>
      </Button>
      {showContacts && <div className="relative min-w-0"><Button
        variant="outline"
        onClick={() => go('/lead-crm?filter=untreated')}
        className={cn('flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-card py-2 ps-1 text-sm font-semibold transition-colors hover:border-primary', untreated > 0 ? 'pe-12' : 'pe-6')}
        aria-label={`אנשי קשר שטרם טופלו: ${untreated}`}
        title="אנשי קשר שטרם טופלו"
      >
        <Users className="h-4 w-4 shrink-0 text-[hsl(var(--nav-new-contacts))]" />
        <span>חדשים</span>
      </Button>{untreated > 0 && <Button variant="ghost" size="icon" aria-label="הסבר על אנשי קשר חדשים" className="absolute end-6 top-1/2 h-5 min-w-5 -translate-y-1/2 rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground" onClick={() => setExplanation(true)}>{untreated > 99 ? '99+' : untreated}</Button>}<Button variant="ghost" size="icon" aria-label="מה מייצג מונה אנשי הקשר?" title="הסבר על המונה" className="absolute end-0 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" onClick={() => setExplanation(true)}><CircleHelp className="h-3.5 w-3.5" /></Button></div>}
    </div><Dialog open={explanation} onOpenChange={setExplanation}><DialogContent dir="rtl"><DialogHeader><DialogTitle>אנשי קשר חדשים</DialogTitle><DialogDescription>המספר מציג אנשי קשר במרחב העבודה הנוכחי שעדיין לא טופלו. כאשר אין אנשי קשר כאלה, המונה מוסתר.</DialogDescription></DialogHeader><Button onClick={() => { setExplanation(false); go('/lead-crm?filter=untreated'); }}>לצפייה באנשי הקשר</Button></DialogContent></Dialog></>
  );
}
