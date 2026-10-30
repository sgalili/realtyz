import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CollapsedOffer({ active, amount, label, onClick, required = false, percentage }: {
  active: boolean; amount: string; label: string; onClick: () => void; required?: boolean; percentage?: string;
}) {
  return <Button type="button" variant="ghost" className={cn('h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 whitespace-normal p-0 text-start text-lg font-bold', active ? 'closing-tone' : required ? 'text-sm font-medium text-destructive' : 'text-sm font-medium text-muted-foreground')} aria-label={label} onClick={onClick}>
    {active ? <><span className="text-sm font-medium text-muted-foreground">{required && <span className="text-destructive">* </span>}ההצעה שלך:</span><span dir="ltr" className="inline-flex items-center gap-1"><span>{amount}</span>{percentage && <span className="text-[13px] font-normal text-muted-foreground">{percentage}</span>}</span></> : 'ההצעה שלך: 0 ₪'}
  </Button>;
}