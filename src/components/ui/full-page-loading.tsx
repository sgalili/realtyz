import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToraffLoader } from './toraff-loader';
import { PAGE_LOADING_THRESHOLD_MS, remainingPageLoadingTime } from '@/lib/pageLoadingDuration';

const PageLoadingContext = createContext<(() => () => void) | null>(null);
const PageLoadingEnabledContext = createContext(true);
const PageLoadingRegionContext = createContext<{
  setHost: (host: HTMLElement | null) => void;
  visible: boolean;
} | null>(null);

type LoadingBounds = { top: number; left: number; width: number; height: number };

/**
 * Marks only the page-content region as loading. The site header and hero stay
 * outside the inert subtree and the overlay is measured to this region alone.
 */
export function PageLoadingRegion({ as = 'div', children, ...props }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'main'; children: ReactNode }) {
  const context = useContext(PageLoadingRegionContext);
  const Component = as as 'div';
  if (!context) return <Component {...props}>{children}</Component>;
  return <Component
    {...props}
    ref={context.setHost}
    data-page-loading-region=""
    aria-busy={context.visible || undefined}
  >
    <div className="page-loading-content" aria-hidden={context.visible || undefined} {...(context.visible ? { inert: true } : {})}>
      {children}
    </div>
  </Component>;
}

/** Persistent host outlives Suspense fallbacks, so fast requests cannot bypass the minimum. */
export function FullPageLoadingProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const inheritedEnabled = useContext(PageLoadingEnabledContext);
  const allowed = enabled && inheritedEnabled;
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [bounds, setBounds] = useState<LoadingBounds | null>(null);
  const count = useRef(0);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef(false);
  const register = useCallback(() => {
    if (!allowed) return () => {};
    clearTimeout(timer.current);
    count.current += 1;
    setFading(false);
    if (startedAt.current === null) startedAt.current = performance.now();
    if (!shown.current && showTimer.current === undefined) {
      showTimer.current = setTimeout(() => {
        showTimer.current = undefined;
        if (count.current === 0) return;
        shown.current = true;
        setVisible(true);
      }, PAGE_LOADING_THRESHOLD_MS);
    }
    return () => {
      count.current -= 1;
      if (count.current !== 0 || startedAt.current === null) return;
      if (!shown.current) {
        clearTimeout(showTimer.current);
        showTimer.current = undefined;
        startedAt.current = null;
        return;
      }
      timer.current = setTimeout(() => {
        if (count.current !== 0) return;
        setFading(true);
        timer.current = setTimeout(() => {
          if (count.current !== 0) return;
          startedAt.current = null;
          shown.current = false;
          setVisible(false);
          setFading(false);
        }, 1_500);
      // Include one paint allowance so commit/portal latency cannot shorten visible time.
      }, remainingPageLoadingTime(startedAt.current, performance.now()) + 50);
    };
  }, [allowed]);

  useLayoutEffect(() => {
    if (allowed) return;
    clearTimeout(timer.current);
    clearTimeout(showTimer.current);
    showTimer.current = undefined;
    startedAt.current = null;
    shown.current = false;
    setVisible(false);
    setFading(false);
  }, [allowed]);

  useLayoutEffect(() => {
    if (!host || !visible) {
      setBounds(null);
      return;
    }
    const update = () => {
      const rect = host.getBoundingClientRect();
      setBounds({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(host);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [host, visible]);

  useLayoutEffect(() => () => { clearTimeout(timer.current); clearTimeout(showTimer.current); }, []);
  const overlayStyle = host && bounds ? {
    inset: 'auto' as const,
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
  } : undefined;

  const active = allowed && visible;
  return <PageLoadingEnabledContext.Provider value={allowed}><PageLoadingContext.Provider value={register}>
    <PageLoadingRegionContext.Provider value={{ setHost, visible: active }}>
      <div className="page-loading-content" aria-busy={active && !host} aria-hidden={active && !host ? true : undefined} {...(active && !host ? { inert: true } : {})}>{children}</div>
      {active && createPortal(<div
        className={`toraff-page-loading-overlay${fading ? ' toraff-page-loading-overlay-exiting' : ''}`}
        style={overlayStyle}
        role="status"
        aria-label="טעינת עמוד"
        aria-live="polite"
      ><ToraffLoader fullPage /></div>, document.body)}
    </PageLoadingRegionContext.Provider>
  </PageLoadingContext.Provider></PageLoadingEnabledContext.Provider>;
}

export function FullPageLoading(_props: { size?: string; label?: string } = {}) {
  const register = useContext(PageLoadingContext);
  useLayoutEffect(() => register?.(), [register]);
  return null;
}
