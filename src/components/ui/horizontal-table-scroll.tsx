import { createContext, forwardRef, useContext, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const TableScrollOwner = createContext(false);

/** A single native two-axis scroll owner, including when wrappers are nested. */
export const HorizontalTableScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => {
    const alreadyOwned = useContext(TableScrollOwner);
    if (alreadyOwned) return <>{children}</>;
    return <TableScrollOwner.Provider value={true}>
      <div ref={ref} data-table-scroll tabIndex={0} className={cn('app-table-scroll relative min-h-0 min-w-0 w-full max-w-full', className)} {...props}>{children}</div>
    </TableScrollOwner.Provider>;
  },
);
HorizontalTableScroll.displayName = 'HorizontalTableScroll';