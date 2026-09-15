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
        requestAnimationFrame(() => {
          window.scrollTo({ top, behavior: 'auto' });
          requestAnimationFrame(() => window.scrollTo({ top, behavior: 'auto' }));
        });
      }
    }
    previousKey.current = key;

    return () => {
      sessionStorage.setItem(scrollKey(key), String(window.scrollY));
    };
  }, [location.key]);

  return null;
}
