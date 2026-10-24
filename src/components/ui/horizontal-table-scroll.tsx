import { createContext, forwardRef, useContext, useEffect, useRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { tableWheelPosition } from '@/lib/tableWheel';

const TableScrollOwner = createContext(false);

/** A single native two-axis scroll owner, including when wrappers are nested. */
export const HorizontalTableScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => {
    const alreadyOwned = useContext(TableScrollOwner);
    const owner = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const element = owner.current;
      if (!element) return;
      const wheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.defaultPrevented) return;
        // Preserve native scrolling in independently scrollable expanded content.
        let target = event.target instanceof HTMLElement ? event.target : null;
        while (target && target !== element) {
          const css = getComputedStyle(target);
          if ((/(auto|scroll)/.test(css.overflowY) && target.scrollHeight > target.clientHeight) || (/(auto|scroll)/.test(css.overflowX) && target.scrollWidth > target.clientWidth)) return;
          target = target.parentElement;
        }
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
        const next = tableWheelPosition({ left: element.scrollLeft, top: element.scrollTop, maxX: element.scrollWidth - element.clientWidth, maxY: element.scrollHeight - element.clientHeight, rtl: getComputedStyle(element).direction === 'rtl' }, event.deltaX * scale, event.deltaY * scale, event.shiftKey);
        if (next.left === element.scrollLeft && next.top === element.scrollTop) return;
        // Consume only movements the table can make, instead of handing them to a preview host.
        event.preventDefault();
        event.stopPropagation();
        element.scrollLeft = next.left;
        element.scrollTop = next.top;
      };
      element.addEventListener('wheel', wheel, { passive: false });
      return () => element.removeEventListener('wheel', wheel);
    }, [alreadyOwned]);
    if (alreadyOwned) return <>{children}</>;
    return <TableScrollOwner.Provider value={true}>
      <div ref={node => { owner.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }} data-table-scroll tabIndex={0} className={cn('app-table-scroll relative min-h-0 min-w-0 w-full max-w-full', className)} {...props}>{children}</div>
    </TableScrollOwner.Provider>;
  },
);
HorizontalTableScroll.displayName = 'HorizontalTableScroll';