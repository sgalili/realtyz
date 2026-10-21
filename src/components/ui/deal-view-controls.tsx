import { Button } from '@/components/ui/button';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { cn } from '@/lib/utils';

export function DealViewControls({ deal, onDealChange, isGrid, onViewToggle }: {
  deal: string; onDealChange: (deal: 'all' | 'sale' | 'rent') => void;
  isGrid: boolean; onViewToggle: () => void;
}) {
  return <div className="ms-auto inline-flex shrink-0 items-center" role="group" aria-label="סוג עסקה ותצוגה">
    {(['sale', 'rent'] as const).map(value => <Button key={value} variant="ghost" size="sm" aria-pressed={deal === 'all' || deal === value} onClick={() => onDealChange(deal === 'all' ? (value === 'sale' ? 'rent' : 'sale') : deal === value ? deal : 'all')} className={cn('gap-1.5 whitespace-nowrap px-2 hover:bg-transparent', deal === 'all' || deal === value ? 'text-foreground' : 'text-muted-foreground/60')}><span className={cn('h-2 w-2 shrink-0 rounded-full', value === 'sale' ? 'bg-success' : 'bg-sale', deal === 'all' || deal === value ? 'opacity-100' : 'opacity-30')} />{value === 'sale' ? 'למכירה' : 'להשכרה'}</Button>)}
    <ViewModeSwitch isGrid={isGrid} onToggle={onViewToggle} />
  </div>;
}