import { Sparkles } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';

interface Props {
  collapsed?: boolean;
  variant?: 'sidebar' | 'fab';
  className?: string;
}

/**
 * High-conversion "Start Free Trial" CTA for demo visitors.
 * Sidebar variant: large gold-gradient button with subtle pulse.
 * FAB variant: floating mobile bar fixed to the bottom.
 *
 * Clicking exits demo mode, which clears demo state and redirects to /auth
 * for sign-up. After sign-up the trial wizard auto-launches via AppLayout.
 */
export function StartTrialCta({ collapsed = false, variant = 'sidebar', className }: Props) {
  const { isDemoMode, setDemoMode } = useDemoMode();

  if (!isDemoMode) return null;

  const handleClick = () => {
    // Calling setDemoMode(false) sets DEMO_EXIT_PENDING and redirects to /auth.
    // After successful sign-up, the trial wizard auto-launches because the
    // new profile is created with plan_status='trial' (handle_new_user trigger).
    setDemoMode(false);
  };

  if (variant === 'fab') {
    return (
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden',
          'bg-gradient-to-t from-background via-background/95 to-transparent',
          className,
        )}
      >
        <button
          onClick={handleClick}
          aria-label="התחל 7 ימי ניסיון חינם"
          className={cn(
            'relative w-full overflow-hidden rounded-2xl px-4 py-3 text-center shadow-2xl',
            'bg-gradient-to-l from-amber-500 via-amber-400 to-yellow-500 text-amber-950',
            'ring-1 ring-amber-300/60 transition-transform active:scale-[0.98]',
            'before:absolute before:inset-0 before:rounded-2xl before:bg-amber-400/40 before:animate-ping before:opacity-50',
          )}
        >
          <span className="relative flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5" />
            <span className="flex flex-col items-center leading-tight">
              <span className="text-sm font-bold">התחל 7 ימי ניסיון חינם</span>
              <span className="text-[10px] font-medium opacity-80">
                ללא התחייבות · עד 100 רשומות
              </span>
            </span>
          </span>
        </button>
      </div>
    );
  }

  // Sidebar variant — collapsed shows tight icon-only puck.
  if (collapsed) {
    return (
      <button
        onClick={handleClick}
        aria-label="התחל 7 ימי ניסיון חינם"
        title="התחל 7 ימי ניסיון חינם"
        className={cn(
          'relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl',
          'bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 shadow-lg ring-1 ring-amber-300/60',
          'transition-transform hover:scale-105 active:scale-95',
          'before:absolute before:inset-0 before:rounded-xl before:bg-amber-400 before:opacity-40 before:animate-ping',
          className,
        )}
      >
        <Sparkles className="relative h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label="התחל 7 ימי ניסיון חינם"
      className={cn(
        'group relative w-full overflow-hidden rounded-xl px-3 py-3 text-right shadow-lg',
        'bg-gradient-to-l from-amber-500 via-amber-400 to-yellow-500 text-amber-950',
        'ring-1 ring-amber-300/60 transition-all hover:shadow-amber-500/40 hover:shadow-xl',
        'active:scale-[0.98]',
        className,
      )}
    >
      {/* Pulse glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl bg-amber-400/40 opacity-40 animate-ping"
      />
      {/* Shine sweep on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
      <span className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-950/15">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="flex flex-1 flex-col leading-tight">
          <span className="text-[13px] font-bold">התחל 7 ימי ניסיון חינם</span>
          <span className="text-[10px] font-medium opacity-80">
            ללא התחייבות · עד 100 רשומות
          </span>
        </span>
      </span>
    </button>
  );
}
