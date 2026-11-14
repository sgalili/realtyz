import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToraffLoader } from './toraff-loader';
import { remainingPageLoadingTime } from '@/lib/pageLoadingDuration';

const PageLoadingContext = createContext<(() => () => void) | null>(null);

/** Persistent host outlives Suspense fallbacks, so fast requests cannot bypass the minimum. */
export function FullPageLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const count = useRef(0);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const register = useCallback(() => {
    clearTimeout(timer.current);
    count.current += 1;
    if (startedAt.current === null) startedAt.current = performance.now();
    setVisible(true);
    return () => {
      count.current -= 1;
      if (count.current !== 0 || startedAt.current === null) return;
      timer.current = setTimeout(() => {
        if (count.current !== 0) return;
        startedAt.current = null;
        setVisible(false);
      // Include one paint allowance so commit/portal latency cannot shorten visible time.
      }, remainingPageLoadingTime(startedAt.current, performance.now()) + 50);
    };
  }, []);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return <PageLoadingContext.Provider value={register}>
    <div className="page-loading-content" aria-busy={visible} aria-hidden={visible || undefined} {...(visible ? { inert: '' } : {})}>{children}</div>
    {visible && createPortal(<div className="toraff-page-loading-overlay" role="status" aria-label="טעינת עמוד" aria-live="polite"><ToraffLoader fullPage /></div>, document.body)}
  </PageLoadingContext.Provider>;
}

export function FullPageLoading(_props: { size?: string; label?: string } = {}) {
  const register = useContext(PageLoadingContext);
  useLayoutEffect(() => register?.(), [register]);
  return null;
}