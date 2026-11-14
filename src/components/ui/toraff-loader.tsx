import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import loader from '@/assets/toraff-loader.mp4.asset.json';
import poster from '@/assets/toraff-loader-poster.jpg.asset.json';

export type ToraffLoaderProps = ComponentProps<'span'> & { size?: number | string };

/** Shared loading presentation; surrounding request state owns its lifetime. */
export function ToraffLoader({ className, size: _size, ...props }: ToraffLoaderProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
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
  }, []);
  return (
    <span {...props} role="status" aria-label={props['aria-label'] ?? 'טוען'} className={cn(className, 'toraff-loader')}>
      <span className="toraff-loader-media" aria-hidden="true">
        {failed ? <img src={poster.url} alt="" /> : <video ref={video} src={loader.url} poster={poster.url} autoPlay muted loop playsInline preload="auto" disablePictureInPicture onError={() => setFailed(true)} />}
      </span>
      <span className="toraff-loader-subtitle" dir="rtl">לוח השותפים של המדינה</span>
    </span>
  );
}