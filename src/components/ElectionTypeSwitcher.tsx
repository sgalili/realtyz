import { useElectionType } from '@/hooks/useElectionType';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Compact toggle: National ⇄ Primaries.
 * Mirrors the landing-page header switcher.
 */
export function ElectionTypeSwitcher({ className, size = 'sm' }: Props) {
  const { type, setType } = useElectionType();
  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-primary/20 bg-card/40 p-1 backdrop-blur-md',
        className,
      )}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setType('national')}
        className={cn(
          'relative whitespace-nowrap rounded-lg font-bold transition-colors duration-200',
          padding,
          type === 'national'
            ? 'bg-primary/15 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        בחירות ארציות
      </button>
      <button
        type="button"
        onClick={() => setType('primaries')}
        className={cn(
          'relative whitespace-nowrap rounded-lg font-bold transition-colors duration-200',
          padding,
          type === 'primaries'
            ? 'bg-primary/15 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        פריימריז
      </button>
    </div>
  );
}
