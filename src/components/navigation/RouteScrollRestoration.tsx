import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const scrollKey = (key: string) => `realtyz:route-scroll:${key}`;

/** Preserves the exact page position when navigating into CRM or property details. */
export function RouteScrollRestoration() {
  const location = useLocation();
  useLayoutEffect(() => {
    const key = location.key;
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
        const restore = () => writeTop(top);
        requestAnimationFrame(restore);
        const timers = [100, 300, 700].map((delay) => window.setTimeout(restore, delay));
        return () => {
          timers.forEach(window.clearTimeout);
          sessionStorage.setItem(scrollKey(key), String(readTop()));
        };
      }
    }
    return () => {
      sessionStorage.setItem(scrollKey(key), String(readTop()));
    };
  }, [location.key]);

  return null;
}
