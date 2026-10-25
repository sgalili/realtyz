import { cn } from '@/lib/utils';

export default function PublicAdHeading({ title, price, dealType, compact = false, dense = false }: { title: string; price?: string; dealType: string | null; compact?: boolean; dense?: boolean }) {
  return (
    <div className="flex w-full min-w-0 items-baseline justify-between gap-3" data-ad-heading>
      <h2 title={title} className={cn('min-w-0 whitespace-normal break-words leading-snug text-foreground font-bold', dense ? 'text-[15px]' : compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]')}>{title}</h2>
      {price && <p dir="rtl" className={cn('shrink-0 whitespace-nowrap leading-snug tabular-nums font-bold', dense ? 'text-[12px]' : compact ? 'text-[14px]' : 'text-[15px] md:text-[19px]', dealType === 'rent' ? 'text-sale' : dealType === 'sale' ? 'text-success' : 'text-foreground')}>{price}{dealType === 'rent' && /\d/.test(price) && !price.includes('לחודש') ? <span className="ms-1 text-[0.8em] font-normal"> / לחודש</span> : null}</p>}
    </div>
  );
}
