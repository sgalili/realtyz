import type { ReactNode } from 'react';

/** Shared publisher header tracks keep icons and controls on the same card edges. */
export function PricingCardHeader({ icon, price, title, help, controls }: {
  icon: ReactNode;
  price: ReactNode;
  title: ReactNode;
  help: ReactNode;
  controls: ReactNode;
}) {
  return <div className="grid grid-cols-[25px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
    <span className="row-span-2 flex h-[25px] w-[25px] items-center justify-start">{icon}</span>
    <div className="min-w-0">{price}</div>
    <div className="row-span-2 flex flex-col items-center gap-1">{help}{controls}</div>
    <div className="col-start-2 min-w-0 text-base font-bold leading-snug [&>button]:contents">{title}</div>
  </div>;
}