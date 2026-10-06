import { cn } from '@/lib/utils';

export default function PublicAdHeading({ title, price, dealType, compact = false, dense = false }: { title: string; price?: string; dealType: string | null; compact?: boolean; dense?: boolean }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3" data-ad-heading>
      <h2 title={title} className={cn('min-w-0 flex-1 break-words leading-snug text-foreground', dense ? 'font-normal text-[15px]' : 'font-bold', compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]')}>{title}</h2>
      {price && <p dir="rtl" className={cn('shrink-0 whitespace-nowrap leading-snug tabular-nums', dense ? 'font-normal text-[15px]' : 'font-bold', compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]', dealType === 'rent' ? 'text-sale' : dealType === 'sale' ? 'text-success' : 'text-foreground')}>{price}</p>}
    </div>
  );
}