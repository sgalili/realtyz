import { cn } from '@/lib/utils';
import { useLayoutEffect, useRef } from 'react';

export default function PublicAdHeading({ title, price, dealType, compact = false, dense = false }: { title: string; price?: string; dealType: string | null; compact?: boolean; dense?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const fit = () => {
      const heading = row.querySelector('h2');
      const amount = row.querySelector('p');
      if (!heading) return;
      heading.style.fontSize = '';
      if (amount) amount.style.fontSize = '';
      const base = Number.parseFloat(getComputedStyle(heading).fontSize);
      const priceBase = amount ? Number.parseFloat(getComputedStyle(amount).fontSize) : 0;
      const required = heading.scrollWidth + (amount?.scrollWidth ?? 0) + 12;
      const ratio = Math.min(1, row.clientWidth / Math.max(1, required));
      heading.style.fontSize = `${base * ratio}px`;
      if (amount) amount.style.fontSize = `${priceBase * ratio}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [title, price, dealType, compact, dense]);
  return (
    <div ref={rowRef} className="flex w-full min-w-0 items-baseline justify-between gap-3" data-ad-heading>
      <h2 title={title} className={cn('min-w-0 whitespace-nowrap leading-snug text-foreground font-bold', dense ? 'text-[15px]' : compact ? 'text-[17px]' : 'text-[19px] md:text-[25px]')}>{title}</h2>
      {price && <p dir="rtl" className={cn('shrink-0 whitespace-nowrap leading-snug tabular-nums font-bold', dense ? 'text-[12px]' : compact ? 'text-[14px]' : 'text-[15px] md:text-[19px]', dealType === 'rent' ? 'text-sale' : dealType === 'sale' ? 'text-success' : 'text-foreground')}>{price}{dealType === 'rent' && /\d/.test(price) && !price.includes('לחודש') ? <span className="ms-1 text-[0.8em] font-normal"> / לחודש</span> : null}</p>}
    </div>
  );
}