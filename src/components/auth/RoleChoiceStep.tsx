import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { useAuth } from '@/hooks/useAuth';
import { AppRole, userRolesQueryKey } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';

/**
 * Shown once, right after a brand-new account signs in for the first time
 * (WhatsApp / SMS / Google / email). Two buttons only, no slogans: the choice
 * decides which product the account gets, then the user goes straight into the
 * matching quick onboarding.
 */
export function RoleChoiceStep({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<'broker' | 'partner' | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const pick = async (role: 'broker' | 'partner') => {
    if (busy) return;
    setBusy(role);
    try {
      if (!user?.id) throw new Error('ההתחברות הסתיימה. יש להתחבר מחדש.');
      const expectedRole: AppRole = role === 'partner' ? 'affiliate' : 'agent';
      if (role === 'partner') {
        const { data, error } = await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
        if (error) throw error;
        if (!(data as { ok?: boolean } | null)?.ok) throw new Error('יצירת חשבון השותף לא הושלמה');
      } else {
        const { data, error } = await supabase.rpc('register_as_broker', { _display_name: null });
        if (error) throw error;
        if (!(data as { ok?: boolean } | null)?.ok) throw new Error('יצירת חשבון המתווך לא הושלמה');
      }

      const [{ data: roleRows, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
      ]);
      if (roleError) throw roleError;
      if (profileError) throw profileError;
      const refreshedRoles = (roleRows ?? []).map((row) => row.role as AppRole);
      if (!profile?.id || !refreshedRoles.includes(expectedRole)) {
        throw new Error('החשבון נוצר חלקית. נסו לבחור שוב.');
      }

      queryClient.setQueryData(userRolesQueryKey(user.id), refreshedRoles);
      await queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) });
      onDone?.();
      navigate(role === 'partner' ? '/affiliate' : '/dashboard', { replace: true });
    } catch (err: any) {
      // The role itself may already have been granted; only block the user when
      // no role landed on the account at all.
      const { data: { user } } = await supabase.auth.getUser();
      const { data: roles } = user
        ? await supabase.from('user_roles').select('role').eq('user_id', user.id)
        : { data: null };
      if (roles && roles.length > 0) {
        const refreshedRoles = roles.map((row) => row.role as AppRole);
        queryClient.setQueryData(userRolesQueryKey(user?.id), refreshedRoles);
        await queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user?.id) });
        onDone?.();
        navigate(refreshedRoles.includes('affiliate') && !refreshedRoles.includes('agent') ? '/affiliate' : '/dashboard', { replace: true });
        return;
      }
      toast.error(err?.message ?? 'לא ניתן להשלים את ההרשמה');
      setBusy(null);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background px-6">
      <img src={realtyzLogo} alt="Realtyz AI" className="h-14 w-auto object-contain" />
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        {(['broker', 'partner'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => pick(role)}
            disabled={!!busy}
            className={cn(
              'rounded-xl border border-border/60 bg-card py-6 text-lg font-bold text-foreground transition-colors',
              'hover:border-primary hover:bg-primary/10 disabled:opacity-60',
              busy === role && 'border-primary bg-primary/10',
            )}
          >
            {role === 'broker' ? 'מתווך' : 'שותף'}
          </button>
        ))}
      </div>
      {busy && <RealtyzLoader size="sm" label="פותח את החשבון..." />}
    </div>
  );
}

export default RoleChoiceStep;
