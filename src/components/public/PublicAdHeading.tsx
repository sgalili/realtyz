import { cn } from '@/lib/utils';

export default function PublicAdHeading({ title, price, dealType, compact = false, dense = false }: { title: string; price?: string; dealType: string | null; compact?: boolean; dense?: boolean }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3" data-ad-heading>
      <h2 title={title} className={cn('min-w-0 whitespace-normal [overflow-wrap:anywhere] leading-snug text-foreground', 'font-bold', dense && 'text-[15px]', compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]')}>{title}</h2>
      {price && <p dir="rtl" className={cn('shrink-0 whitespace-nowrap leading-snug tabular-nums', 'font-bold', dense && 'text-[15px]', compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]', dealType === 'rent' ? 'text-sale' : dealType === 'sale' ? 'text-success' : 'text-foreground')}>{price}</p>}
    </div>
  );
}