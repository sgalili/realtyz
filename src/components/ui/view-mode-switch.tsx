import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Single mutually-exclusive view control: it always shows ONLY the icon of the
 * view you are about to switch to. In list/table view you see the grid icon; in
 * grid view you see the list icon. Both icons are never rendered together.
 */
export function ViewModeSwitch({
  isGrid,
  onToggle,
  className = '',
}: {
  isGrid: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = isGrid ? 'מעבר לתצוגת רשימה' : 'מעבר לתצוגת כרטיסיות';
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`h-8 w-9 shrink-0 border-0 bg-transparent text-muted-foreground shadow-none hover:text-primary ${className}`}
    >
      {isGrid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
    </Button>
  );
}
