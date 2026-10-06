import type { ReactNode } from 'react';

export function HorizontalTableScroll({ children }: { children: ReactNode }) {
  return <div className="min-w-0 w-full max-w-full">
    <div data-table-scroll className="relative w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">{children}</div>
  </div>;
}