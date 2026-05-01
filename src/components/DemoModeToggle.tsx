/**
 * Header switch that flips the global Demo Context.
 * No auth swap — purely a client-side display flag.
 * Visible only to super_admin users.
 *
 * Variants:
 *   - 'pill'    (default): rounded chip with DEMO/ON/OFF text labels
 *   - 'compact': visual-only color switch (no text)
 *   - 'hero':   single button with the word "DEMO" inside.
 *               Green = ON, Grey = OFF. No external label, no toast.
 */
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

type DemoModeToggleProps = {
  className?: string;
  variant?: 'pill' | 'compact' | 'hero';
};

export function DemoModeToggle({ className, variant = 'pill' }: DemoModeToggleProps) {
  const { isDemoMode, setDemoMode } = useDemoMode();
  const { isSuperAdmin, loading } = useUserRole();
  const queryClient = useQueryClient();

  if (loading || !isSuperAdmin) return null;

  const setNext = (next: boolean) => {
    setDemoMode(next);
    // Force every active query to refetch so demo/real datasets swap immediately.
    queryClient.invalidateQueries();
    // Intentionally no toast — silent toggle per UX request.
  };

  const titleText = isDemoMode ? 'מצב דמו פעיל — נתוני הדגמה' : 'מצב דמו כבוי — נתונים אמיתיים';

  if (variant === 'hero') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDemoMode}
        aria-label={titleText}
        title={titleText}
        onClick={() => setNext(!isDemoMode)}
        className={cn(
          'inline-flex h-9 select-none items-center justify-center rounded-full px-4 text-xs font-bold tracking-[0.18em] uppercase shadow-sm transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
          isDemoMode
            ? 'bg-success text-success-foreground hover:bg-success/90'
            : 'bg-muted-foreground/30 text-primary-foreground hover:bg-muted-foreground/40',
          className,
        )}
      >
        Demo
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <span
        className={cn('inline-flex items-center', className)}
        dir="ltr"
        title={titleText}
        aria-label={titleText}
      >
        <Switch
          checked={isDemoMode}
          onCheckedChange={setNext}
          aria-label="הפעל/כבה מצב דמו"
          className="h-5 w-10 [--switch-thumb-size:1rem] [--switch-thumb-translate:1.25rem] data-[state=checked]:bg-success data-[state=unchecked]:bg-muted-foreground/40"
        />
      </span>
    );
  }

  return (
    <label
      className={cn(
        'flex select-none items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 py-1 text-[11px] font-bold text-primary-foreground',
        className,
      )}
      dir="ltr"
      title={titleText}
    >
      <span className="tracking-wide">DEMO</span>
      <Switch
        checked={isDemoMode}
        onCheckedChange={setNext}
        className="h-[18px] w-9 [--switch-thumb-size:0.875rem] [--switch-thumb-translate:1.25rem] data-[state=checked]:bg-success data-[state=unchecked]:bg-input"
      />
      <span className="tabular-nums">{isDemoMode ? 'ON' : 'OFF'}</span>
    </label>
  );
}

export default DemoModeToggle;
