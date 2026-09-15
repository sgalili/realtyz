import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const scrollKey = (key: string) => `realtyz:route-scroll:${key}`;

/** Preserves the exact page position while a CRM contact sheet is opened. */
export function RouteScrollRestoration() {
  const location = useLocation();
  const previousKey = useRef(location.key);

  useLayoutEffect(() => {
    const key = location.key;
    const stored = sessionStorage.getItem(scrollKey(key));
    if (stored) {
      const top = Number(stored);
      if (Number.isFinite(top)) {
        // Async lists can grow after the route first renders. Re-apply briefly
        // so returning from a CRM sheet lands on the precise original card.
        const restore = () => window.scrollTo({ top, behavior: 'auto' });
        requestAnimationFrame(restore);
        const timers = [100, 300, 700].map((delay) => window.setTimeout(restore, delay));
        return () => {
          timers.forEach(window.clearTimeout);
          sessionStorage.setItem(scrollKey(key), String(window.scrollY));
        };
      }
    }
    previousKey.current = key;

    return () => {
      sessionStorage.setItem(scrollKey(key), String(window.scrollY));
    };
  }, [location.key]);

  return null;
}
