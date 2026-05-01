/**
 * Header switch that flips the global Demo Context.
 * No auth swap — purely a client-side display flag.
 * Visible only to super_admin users.
 *
 * Variants:
 *   - 'pill'    (default): rounded chip with DEMO/ON/OFF text labels
 *   - 'compact': visual-only color switch (no text), used in PageToolbar
 */
import { Switch } from '@/components/ui/switch';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type DemoModeToggleProps = {
  className?: string;
  variant?: 'pill' | 'compact';
};

export function DemoModeToggle({ className, variant = 'pill' }: DemoModeToggleProps) {
  const { isDemoMode, setDemoMode } = useDemoMode();
  const { isSuperAdmin, loading } = useUserRole();
  const queryClient = useQueryClient();

  if (loading || !isSuperAdmin) return null;

  const handleChange = (next: boolean) => {
    setDemoMode(next);
    // Force every active query to refetch so demo/real datasets swap immediately.
    queryClient.invalidateQueries();
    toast.success(next ? 'מצב דמו פעיל' : 'מצב דמו כבוי');
  };

  const titleText = isDemoMode ? 'מצב דמו פעיל — נתוני הדגמה' : 'מצב דמו כבוי — נתונים אמיתיים';

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
          onCheckedChange={handleChange}
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
        onCheckedChange={handleChange}
        className="h-[18px] w-9 [--switch-thumb-size:0.875rem] [--switch-thumb-translate:1.25rem] data-[state=checked]:bg-success data-[state=unchecked]:bg-input"
      />
      <span className="tabular-nums">{isDemoMode ? 'ON' : 'OFF'}</span>
    </label>
  );
}

export default DemoModeToggle;
