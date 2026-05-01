/**
 * Header switch that flips the global Demo Context.
 * No auth swap — purely a client-side display flag.
 * Visible only to super_admin users.
 */
import { Switch } from '@/components/ui/switch';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function DemoModeToggle({ className }: { className?: string }) {
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

  return (
    <label
      className={cn(
        'flex select-none items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 py-1 text-[11px] font-bold text-primary-foreground',
        className,
      )}
      dir="ltr"
      title={isDemoMode ? 'מצב דמו פעיל — נתוני הדגמה' : 'מצב דמו כבוי — נתונים אמיתיים'}
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
