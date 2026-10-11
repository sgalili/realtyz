import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, userRolesQueryKey } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { accountIdentity } from '@/lib/accountMode';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAppMode, type AppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Switch between the preserved core identity and additive partner membership.
 * Server roles authorize access; the display preference never grants a role.
 */
export function AppModeSwitcher({ keepSidebarOpen = false }: { keepSidebarOpen?: boolean }) {
  const navigate = useNavigate();
  const { mode, setMode } = useAppMode();
  const { roles, isAffiliate, loading, error: roleError } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const identity = accountIdentity(roles);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const busy = useIsMutating({ mutationKey: ['activate-partner', user?.id] }) > 0;
  const activation = useMutation({
    mutationKey: ['activate-partner', user?.id],
    mutationFn: async (next: AppMode) => {
      if (!user || roleError || loading) throw new Error('לא ניתן להחליף מצב כרגע');
      if (next === 'partner') {
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

  if (loading || roleError || !user || !identity.canSwitch) return null;

  const options: { value: AppMode; label: string }[] = [
    { value: 'broker', label: identity.label },
    { value: 'partner', label: 'שותף' },
  ];

  return (
    <div
      dir="rtl"
      role="radiogroup"
      aria-label="החלפת מצב עבודה"
      data-keep-terms
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/60 p-0.5"
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        return (
          <Button
            variant="ghost"
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => { if (opt.value !== mode && !busy) activation.mutate(opt.value); }}
            title={opt.label}
            className={cn(
              'h-8 rounded px-3 text-sm font-semibold transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {busy && opt.value === 'partner' && <Loader2 className="h-3 w-3 animate-spin" />}<span>{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default AppModeSwitcher;
