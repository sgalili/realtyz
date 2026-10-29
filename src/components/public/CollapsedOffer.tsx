import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CollapsedOffer({ active, amount, placeholder, label, onClick }: {
  active: boolean; amount: string; placeholder: string; label: string; onClick: () => void;
}) {
  return <Button type="button" variant="ghost" className={cn('h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 whitespace-normal p-0 text-start text-lg font-bold', active ? 'closing-tone' : 'text-sm font-medium text-muted-foreground')} aria-label={label} onClick={onClick}>
    {active ? <><span className="text-sm font-medium text-muted-foreground">ההצעה שלך:</span><span dir="ltr">{amount}</span></> : placeholder}
  </Button>;
}