import { useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import loader from '@/assets/toraff-loader.mp4.asset.json';
import poster from '@/assets/toraff-loader-poster.jpg.asset.json';
import { Loader2 } from 'lucide-react';

export type ToraffLoaderProps = ComponentProps<'span'> & { size?: number | string; fullPage?: boolean };

/** Shared loading presentation; surrounding request state owns its lifetime. */
export function ToraffLoader({ className, size: _size, fullPage = false, ...props }: ToraffLoaderProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  // The loader can render before the query provider exists, so read the cached mode safely.
  const queryClient = useContext(QueryClientContext);
  const brokersOnly = queryClient?.getQueryData<string>(['platform-mode']) !== 'full_marketplace';
  useEffect(() => {
    if (!fullPage) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (!video.current) return;
      if (reduced.matches || document.documentElement.hasAttribute('data-a11y-motion')) video.current.pause();
      else void video.current.play().catch(() => undefined);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y-motion'] });
    reduced.addEventListener('change', sync);
    sync();
    return () => { reduced.removeEventListener('change', sync); observer.disconnect(); };
  }, [fullPage]);
  if (!fullPage) return <Loader2 role="status" aria-label={props['aria-label'] ?? 'טוען'} className={cn('size-4 animate-spin', className)} />;
  return (
    <span {...props} role="status" aria-label={props['aria-label'] ?? 'טוען'} className={cn(className, 'toraff-loader')}>
      <span className="toraff-loader-media" aria-hidden="true">
        {failed ? <img src={poster.url} alt="" /> : <video ref={video} src={loader.url} poster={poster.url} autoPlay muted loop playsInline preload="auto" disablePictureInPicture onError={() => setFailed(true)} />}
      </span>
      <span className="toraff-loader-subtitle" dir="rtl">{brokersOnly ? 'המערכת היחידה שכל מתווך חייב' : 'לוח השותפים של המדינה'}</span>
    </span>
  );
}