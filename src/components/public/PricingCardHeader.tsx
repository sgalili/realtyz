import type { ReactNode } from 'react';

/** Shared publisher header tracks keep icons and controls on the same card edges. */
export function PricingCardHeader({ icon, price, title, help, controls }: {
  icon: ReactNode;
  price: ReactNode;
  title: ReactNode;
  help: ReactNode;
  controls: ReactNode;
}) {
  return <div className="grid grid-cols-[49px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
    <span className="row-span-2 flex h-[49px] w-[49px] items-center justify-start">{icon}</span>
    <div className="flex min-h-9 min-w-0 items-center">{price}</div>
    <div className="flex h-9 items-center gap-2">{controls}</div>
    <div className="col-span-2 col-start-2 flex min-w-0 items-center gap-1 text-base font-bold leading-snug">{title}{help}</div>
  </div>;
}