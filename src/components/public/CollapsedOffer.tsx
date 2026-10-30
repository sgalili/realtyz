import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CollapsedOffer({ active, amount, label, onClick, required = false }: {
  active: boolean; amount: string; label: string; onClick: () => void; required?: boolean;
}) {
  return <Button type="button" variant="ghost" className={cn('h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 whitespace-normal p-0 text-start text-lg font-bold', active ? 'closing-tone' : required ? 'text-sm font-medium text-destructive' : 'text-sm font-medium text-muted-foreground')} aria-label={label} onClick={onClick}>
    {active ? <><span className="text-sm font-medium text-muted-foreground">ההצעה שלך:</span><span dir="ltr">{amount}</span></> : 'ההצעה שלך: 0 ₪'}
  </Button>;
}