import { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLocation } from 'react-router-dom';
import { RealtyzWave } from '@/components/RealtyzWave';

/**
 * Finds the navy hero block (CSS-styled `main > div > div:first-child` that
 * wraps an h1) and mounts a JS-driven RealtyzWave SVG at its bottom edge.
 * Uses a MutationObserver because pages render asynchronously after route
 * changes (data fetches, suspense, etc.).
 */
export function HeroWaveMount() {
  const location = useLocation();

  useEffect(() => {
    const roots: Root[] = [];
    const containers: HTMLDivElement[] = [];

    const mountInto = (el: HTMLElement) => {
      if (el.dataset.realtyzWaveMounted === '1') return;
      // Allow pages to opt out (e.g. SubscriptionManager has its own layout)
      if (el.closest('[data-no-hero-wave]')) return;
      // Must contain an h1 (direct or one level deep) to be a hero block
      const hasH1 = !!el.querySelector(':scope > h1, :scope > div > h1');
      if (!hasH1) return;

      el.dataset.realtyzWaveMounted = '1';

      const host = document.createElement('div');
      host.style.position = 'absolute';
      host.style.insetInline = '0';
      host.style.bottom = '0';
      host.style.height = '24px';
      host.style.zIndex = '0';
      host.style.pointerEvents = 'none';
      el.appendChild(host);

      const root = createRoot(host);
      root.render(
        <RealtyzWave
          position="bottom"
          variant="wave-soft"
          fill="hsl(210 8% 91%)"
          seed={Math.floor(Math.random() * 100) + 1}
        />
      );
      roots.push(root);
      containers.push(host);
    };

    const scan = () => {
      const candidates = document.querySelectorAll<HTMLElement>(
        'main > div > div:first-child'
      );
      candidates.forEach(mountInto);
    };

    // Initial scan + retries (page may render data asynchronously)
    scan();
    const t1 = window.setTimeout(scan, 80);
    const t2 = window.setTimeout(scan, 300);
    const t3 = window.setTimeout(scan, 800);

    // Observe DOM mutations inside <main> so heroes that mount later get the wave
    const main = document.querySelector('main');
    let observer: MutationObserver | null = null;
    if (main) {
      observer = new MutationObserver(() => scan());
      observer.observe(main, { childList: true, subtree: true });
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      observer?.disconnect();
      roots.forEach((r) => r.unmount());
      containers.forEach((c) => {
        const parent = c.parentElement;
        if (parent) {
          delete parent.dataset.realtyzWaveMounted;
           if (c.parentNode === parent) parent.removeChild(c);
        }
      });
    };
  }, [location.pathname]);

  return null;
}
