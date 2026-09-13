import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { RealtyzLoader } from '@/components/RealtyzLoader';

/**
 * Shown once, right after a brand-new account signs in for the first time
 * (WhatsApp / SMS / Google / email). Two buttons only, no slogans: the choice
 * decides which product the account gets, then the user goes straight into the
 * matching quick onboarding.
 */
export function RoleChoiceStep({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<'broker' | 'partner' | null>(null);
  const queryClient = useQueryClient();

  const pick = async (role: 'broker' | 'partner') => {
    if (busy) return;
    setBusy(role);
    try {
      if (role === 'partner') {
        const { error } = await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('register_as_broker', { _display_name: null });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      onDone?.();
      window.location.assign(role === 'partner' ? '/affiliate' : '/dashboard');
    } catch (err: any) {
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
