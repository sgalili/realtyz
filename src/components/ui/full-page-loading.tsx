import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToraffLoader } from './toraff-loader';
import { PAGE_LOADING_THRESHOLD_MS, remainingPageLoadingTime } from '@/lib/pageLoadingDuration';

const PageLoadingContext = createContext<(() => () => void) | null>(null);

/** Persistent host outlives Suspense fallbacks, so fast requests cannot bypass the minimum. */
export function FullPageLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const count = useRef(0);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const showTimer = useRef<ReturnType<typeof setTimeout>>();
  const shown = useRef(false);
  const register = useCallback(() => {
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
  }, []);
  useLayoutEffect(() => () => { clearTimeout(timer.current); clearTimeout(showTimer.current); }, []);
  return <PageLoadingContext.Provider value={register}>
    <div className="page-loading-content" aria-busy={visible} aria-hidden={visible || undefined} {...(visible ? { inert: '' } : {})}>{children}</div>
    {visible && createPortal(<div className={`toraff-page-loading-overlay${fading ? ' toraff-page-loading-overlay-exiting' : ''}`} role="status" aria-label="טעינת עמוד" aria-live="polite"><ToraffLoader fullPage /></div>, document.body)}
  </PageLoadingContext.Provider>;
}

export function FullPageLoading(_props: { size?: string; label?: string } = {}) {
  const register = useContext(PageLoadingContext);
  useLayoutEffect(() => register?.(), [register]);
  return null;
}
