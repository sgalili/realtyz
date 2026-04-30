import { Switch } from '@/components/ui/switch';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/hooks/useAuth';
import { useElectionType } from '@/hooks/useElectionType';
import { cn } from '@/lib/utils';

export function DemoModeToggle() {
  const { isDemoMode, setDemoMode } = useDemoMode();
  const { user } = useAuth();
  const { type } = useElectionType();
  void user;

  const handleChange = (checked: boolean) => {
    setDemoMode(checked);
  };

  return (
    <div className="flex flex-col items-center gap-1 translate-x-[12px]">
      <label className="flex items-center gap-2 cursor-pointer select-none" dir="ltr">
        <Switch checked={isDemoMode} onCheckedChange={handleChange} className="h-[18px] w-14 [--switch-thumb-size:0.875rem] [--switch-thumb-translate:2.375rem] data-[state=checked]:bg-success data-[state=unchecked]:bg-input [&>span:last-child]:bg-foreground">
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-black uppercase leading-none text-success-foreground',
              !isDemoMode && 'left-[calc(50%+6px)] -translate-x-1/2 text-foreground',
              isDemoMode && 'left-1.5',
            )}
          >
            Demo
          </span>
        </Switch>
      </label>
      {type === 'primaries' && (
        <span className="text-[10px] font-bold tracking-wide text-primary-foreground/85" dir="rtl">
          פריימריז
        </span>
      )}
    </div>
  );
}
