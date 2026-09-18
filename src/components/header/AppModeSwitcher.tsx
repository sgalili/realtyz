import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode, type AppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';

/**
 * Instant switch between broker mode (full CRM + Rita) and partner mode
 * (referrals, commissions, recruitment). Same session, no second login.
 * Hidden for partner-only accounts, which have no broker side at all.
 */
export function AppModeSwitcher() {
  const navigate = useNavigate();
  const { mode, setMode } = useAppMode();
  const { isTeamMember, isAffiliateOnly, loading } = useUserRole();
  const [busy, setBusy] = useState(false);

  if (loading || isAffiliateOnly || !isTeamMember) return null;

  const switchTo = async (next: AppMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    try {
      if (next === 'partner') {
        // Idempotent: makes sure the account really has a partner profile.
        await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
        setMode('partner');
        navigate('/affiliate-network');
        toast.success('עברת למצב שותף');
      } else {
        setMode('broker');
        navigate('/');
        toast.success('עברת למצב מתווך');
      }
    } catch (e: any) {
      toast.error(e?.message || 'החלפת המצב נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const options: { value: AppMode; label: string }[] = [
    { value: 'broker', label: 'מתווך' },
    { value: 'partner', label: 'שותף' },
  ];

  return (
    <div
      dir="rtl"
      role="radiogroup"
      aria-label="החלפת מצב עבודה"
      className="flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5"
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => void switchTo(opt.value)}
            title={opt.label}
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default AppModeSwitcher;
