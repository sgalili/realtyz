import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { StrategicGrowthSlider } from '@/components/dashboard/StrategicGrowthSlider';

/**
 * Mounts the StrategicGrowthSlider immediately AFTER the dashboard hero block
 * via a React portal, so it inherits the same MandateProvider context as the
 * rest of the app. Uses the same hero-detection strategy as HeroWaveMount:
 * looks for `main > div > div:first-child` containing an h1.
 *
 * Renders ONLY on the dashboard route (`/` and `/dashboard`) for both demo
 * and real users. Real users see the slider as a "what if" simulator.
 */
const DASHBOARD_PATHS = new Set(['/', '/dashboard']);

export function MandateSelectorMount() {
  const location = useLocation();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const isDashboard = DASHBOARD_PATHS.has(location.pathname);

  useEffect(() => {
    if (!isDashboard) {
      setHost(null);
      return;
    }

    let createdHost: HTMLDivElement | null = null;

    const tryMount = () => {
      if (createdHost) return;
      const candidates = document.querySelectorAll<HTMLElement>(
        'main > div > div:first-child',
      );
      for (const heroEl of candidates) {
        const hasH1 = !!heroEl.querySelector(':scope > h1, :scope > div > h1');
        if (!hasH1) continue;
        const el = document.createElement('div');
        el.className = 'realtyz-transaction-mount flex justify-center pt-4 pb-2';
        heroEl.insertAdjacentElement('afterend', el);
        createdHost = el;
        setHost(el);
        return;
      }
    };

    tryMount();
    const t1 = window.setTimeout(tryMount, 80);
    const t2 = window.setTimeout(tryMount, 300);
    const t3 = window.setTimeout(tryMount, 800);

    const main = document.querySelector('main');
    let observer: MutationObserver | null = null;
    if (main) {
      observer = new MutationObserver(() => tryMount());
      observer.observe(main, { childList: true, subtree: true });
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      observer?.disconnect();
      if (createdHost?.parentElement) createdHost.parentElement.removeChild(createdHost);
      setHost(null);
    };
  }, [location.pathname, isDashboard]);

  if (!host || !isDashboard) return null;
  return createPortal(<StrategicGrowthSlider />, host);
}

