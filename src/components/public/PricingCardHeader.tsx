import type { ReactNode } from 'react';

/** Shared publisher header tracks keep icons and controls on the same card edges. */
export function PricingCardHeader({ icon, price, title, help, controls }: {
  icon: ReactNode;
  price: ReactNode;
  title: ReactNode;
  help: ReactNode;
  controls: ReactNode;
}) {
  return <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
    <span className="flex h-[30px] w-[30px] items-start justify-start">{icon}</span>
    <div className="min-w-0 text-base font-bold leading-snug [&>button]:contents">{title}</div>
    <div className="flex items-start justify-center">{help}</div>
    <div className="col-start-2 flex min-h-8 min-w-0 items-center">{price}</div>
    <div className="flex h-8 items-center justify-center">{controls}</div>
  </div>;
}