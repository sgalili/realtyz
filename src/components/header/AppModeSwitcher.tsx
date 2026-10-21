import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, userRolesQueryKey } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { accountIdentity } from '@/lib/accountMode';
import { useWorkspaceOwnerRoles } from '@/hooks/useWorkspaceFeatures';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAppMode, type AppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useAccountIdentity } from '@/hooks/useAccountIdentity';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { PartnerOnboarding } from '@/components/affiliate/PartnerOnboarding';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Switch between the preserved core identity and additive partner membership.
 * Server roles authorize access; the display preference never grants a role.
 */
export function AppModeSwitcher({ keepSidebarOpen = false, className }: { keepSidebarOpen?: boolean; className?: string }) {
  const navigate = useNavigate();
  const [onboarding, setOnboarding] = useState(false);
  const consent = usePartnerConsent();
  const { mode, setMode } = useAppMode();
  const { roles, isAffiliate, loading, error: roleError } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ownerRoles = useWorkspaceOwnerRoles();
  const { loading: workspaceLoading, activeWorkspaceId } = useWorkspace();
  const identity = useAccountIdentity();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const busy = useIsMutating({ mutationKey: ['activate-partner', user?.id] }) > 0;
  const activation = useMutation({
    mutationKey: ['activate-partner', user?.id],
    mutationFn: async (next: AppMode) => {
      if (!user || roleError || loading) throw new Error('לא ניתן להחליף מצב כרגע');
      if (next === 'partner') {
        if (consent.data !== true) { setOnboarding(true); return; }
        if (!isAffiliate) {
          const { data, error } = await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
          if (error) throw error;
          if (!(data as { ok?: boolean } | null)?.ok) throw new Error('הפעלת מצב שותף נכשלה');
          await queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) });
        }
        setMode('partner');
        navigate('/affiliate-network');
        toast.success('עברת למצב שותף');
      } else {
        setMode('broker');
        navigate(identity.home);
        toast.success(`עברת למצב ${identity.label}`);
      }
      if (keepSidebarOpen) {
        sessionStorage.setItem('realtyz:keep-sidebar-open', '1');
        requestAnimationFrame(() => isMobile ? setOpenMobile(true) : setOpen(true));
      } else { setOpenMobile(false); setOpen(false); }
    },
    onError: () => toast.error('החלפת המצב נכשלה. אפשר לנסות שוב.'),
  });

  if (!user) return null;
  const unavailable = loading || workspaceLoading || !activeWorkspaceId || roleError || busy || consent.isLoading || consent.isError;

  return (
    <><div
      dir="rtl"
      role="group"
      aria-label="החלפת מצב עבודה"
      data-keep-terms
      className={cn("inline-flex shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-muted/60 px-2 py-1", className)}
    >
      <span className="whitespace-nowrap text-xs font-semibold">מצב שותף</span>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Switch aria-label="מצב שותף" checked={mode === 'partner'} disabled={unavailable || (!identity.canSwitch && mode === 'partner')} onCheckedChange={checked => activation.mutate(checked ? 'partner' : 'broker')} />}
    </div>
    <Dialog open={onboarding} onOpenChange={setOnboarding}>
      <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto p-2 [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">הצטרפות לתוכנית השותפים</DialogTitle>
        <DialogDescription className="sr-only">היכרות עם התוכנית ואישור התקנון</DialogDescription>
        <PartnerOnboarding onCancel={() => setOnboarding(false)} onComplete={() => { setOnboarding(false); setMode('partner'); navigate('/affiliate-network'); }} />
      </DialogContent>
    </Dialog></>
  );
}

export default AppModeSwitcher;
