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
      const updatePanels = () => {
        element.style.setProperty('--table-viewport-width', `${element.clientWidth}px`);
      };
      updatePanels();
      const resize = new ResizeObserver(updatePanels);
      resize.observe(element);
      const wheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.defaultPrevented) return;
        // Preserve native scrolling in independently scrollable expanded content.
        let target = event.target instanceof HTMLElement ? event.target : null;
        while (target && target !== element) {
          const css = getComputedStyle(target);
          const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
          if ((horizontal && /(auto|scroll)/.test(css.overflowX) && target.scrollWidth > target.clientWidth) || (!horizontal && /(auto|scroll)/.test(css.overflowY) && target.scrollHeight > target.clientHeight)) return;
          target = target.parentElement;
        }
        if (event.target instanceof HTMLElement && event.target.closest('[data-table-fixed-panel]') && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
        const next = tableWheelPosition({ left: element.scrollLeft, top: element.scrollTop, maxX: element.scrollWidth - element.clientWidth, maxY: element.scrollHeight - element.clientHeight, rtl: getComputedStyle(element).direction === 'rtl' }, event.deltaX * scale, event.deltaY * scale, event.shiftKey);
        if (next.left === element.scrollLeft && next.top === element.scrollTop) return;
        // Consume only movements the table can make, instead of handing them to a preview host.
        event.preventDefault();
        event.stopPropagation();
        element.scrollLeft = next.left;
        element.scrollTop = next.top;
        updatePanels();
      };
      // Touch gestures lock to the first dominant axis; the other axis is held in place.
      let gesture: { x: number; y: number; left: number; top: number; axis: 'x' | 'y' | null; panel: boolean } | null = null;
      let releaseTimer: ReturnType<typeof setTimeout> | undefined;
      const start = (event: TouchEvent) => {
        // A new header gesture must not inherit a body's previous momentum lock.
        clearTimeout(releaseTimer);
        if (event.touches.length !== 1) { gesture = null; return; }
        const t = event.touches[0];
        gesture = { x: t.clientX, y: t.clientY, left: element.scrollLeft, top: element.scrollTop, axis: null, panel: event.target instanceof HTMLElement && !!event.target.closest('[data-table-fixed-panel]') };
      };
      const move = (event: TouchEvent) => {
        if (!gesture || gesture.axis || event.touches.length !== 1) return;
        const t = event.touches[0];
        const dx = Math.abs(t.clientX - gesture.x), dy = Math.abs(t.clientY - gesture.y);
        if (dx + dy < 6) return;
        gesture.axis = dx > dy ? 'x' : 'y';
      };
      const scroll = () => {
        if (gesture?.axis) {
          if ((gesture.panel || gesture.axis === 'y') && element.scrollLeft !== gesture.left) element.scrollLeft = gesture.left;
          if (!gesture.panel && gesture.axis === 'x' && element.scrollTop !== gesture.top) element.scrollTop = gesture.top;
        }
        updatePanels();
      };
      const end = () => {
        // Keep the lock through momentum, then release.
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => { gesture = null; }, 600);
      };
      element.addEventListener('wheel', wheel, { passive: false });
      element.addEventListener('touchstart', start, { passive: true });
      element.addEventListener('touchmove', move, { passive: true });
      element.addEventListener('touchend', end, { passive: true });
      element.addEventListener('touchcancel', end, { passive: true });
      element.addEventListener('scroll', scroll, { passive: true });
      return () => {
        resize.disconnect();
        clearTimeout(releaseTimer);
        element.removeEventListener('wheel', wheel);
        element.removeEventListener('touchstart', start);
        element.removeEventListener('touchmove', move);
        element.removeEventListener('touchend', end);
        element.removeEventListener('touchcancel', end);
        element.removeEventListener('scroll', scroll);
      };
    }, [alreadyOwned]);
    if (alreadyOwned) return <>{children}</>;
    return <TableScrollOwner.Provider value={true}>
      <div ref={node => { owner.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }} data-table-scroll tabIndex={0} className={cn('app-table-scroll relative min-h-0 min-w-0 w-full max-w-full', className)} {...props}>{children}</div>
    </TableScrollOwner.Provider>;
  },
);
HorizontalTableScroll.displayName = 'HorizontalTableScroll';

/** Native sticky positioning anchors bodies in the same paint as table scrolling. */
export function FixedTablePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-table-fixed-panel className={cn('sticky start-0 w-[var(--table-viewport-width)] min-w-0 max-w-none', className)} {...props} />;
}