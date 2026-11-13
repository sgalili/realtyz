import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const scrollKey = (key: string) => `realtyz:route-scroll:${key}`;
const ownerSelector = '.realtyz-main-surface, [data-table-scroll], [data-route-scroll]';
type OwnerPosition = { top: number; left: number };

export function readScrollOwners(): OwnerPosition[] {
  return Array.from(document.querySelectorAll<HTMLElement>(ownerSelector), el => ({ top: el.scrollTop, left: el.scrollLeft }));
}

export function restoreScrollOwners(positions: OwnerPosition[]) {
  document.querySelectorAll<HTMLElement>(ownerSelector).forEach((el, index) => {
    const position = positions[index];
    if (!position) return;
    el.scrollTop = position.top;
    el.scrollLeft = position.left;
  });
}

/** Preserves the exact page position when navigating into CRM or property details. */
export function RouteScrollRestoration() {
  const location = useLocation();
  const positions = useRef(new Map<string, OwnerPosition[]>());
  useLayoutEffect(() => {
    const key = location.key;
    const save = () => {
      sessionStorage.setItem(scrollKey(key), String(readTop()));
      positions.current.set(key, readScrollOwners());
    };
    const scrollSurface = () => document.querySelector<HTMLElement>('.realtyz-main-surface');
    const readTop = () => scrollSurface()?.scrollTop ?? window.scrollY;
    const writeTop = (top: number) => {
      const surface = scrollSurface();
      if (surface) surface.scrollTo({ top, behavior: 'auto' });
      else window.scrollTo({ top, behavior: 'auto' });
    };
    const stored = sessionStorage.getItem(scrollKey(key));
    if (stored) {
      const top = Number(stored);
      if (Number.isFinite(top)) {
        // Async lists can grow after the route first renders. Re-apply briefly
        // so returning from a CRM sheet lands on the precise original card.
        const restore = () => {
          writeTop(top);
          const owners = positions.current.get(key);
          if (owners) restoreScrollOwners(owners);
        };
        requestAnimationFrame(restore);
        const timers = [100, 300, 700, 1200].map((delay) => window.setTimeout(restore, delay));
        // Stop restoring as soon as the user deliberately resumes scrolling.
        const stop = () => timers.forEach(window.clearTimeout);
        window.addEventListener('wheel', stop, { passive: true });
        window.addEventListener('touchstart', stop, { passive: true });
        return () => {
          timers.forEach(window.clearTimeout);
          window.removeEventListener('wheel', stop);
          window.removeEventListener('touchstart', stop);
          save();
        };
      }
    }
    return () => {
      save();
    };
  }, [location.key]);

  return null;
}
