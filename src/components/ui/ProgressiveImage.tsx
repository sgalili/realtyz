import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** Optional tiny/low-res variant painted (blurred) until the full image lands. */
  placeholderSrc?: string | null;
  /** Load immediately instead of waiting for the element to approach the viewport. */
  eager?: boolean;
  onError?: () => void;
  onLoad?: () => void;
};

/**
 * Blur-up progressive image.
 *
 * Paints a blurred low-res placeholder (or a shimmer) instantly, then swaps in
 * the full-resolution file the moment it decodes. Off-screen images only start
 * downloading once they get close to the viewport, so a 30-photo gallery never
 * blocks the first paint of the property page.
 */
export function ProgressiveImage({ src, alt = '', className, placeholderSrc, eager, onError, onLoad }: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setLoaded(false); }, [src]);

  useEffect(() => {
    if (visible || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={holderRef} className={cn('relative overflow-hidden bg-muted', className)}>
      {placeholderSrc && !loaded ? (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-lg"
        />
      ) : null}
      {!loaded && !placeholderSrc ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted" />
      ) : null}
      {visible ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          // @ts-expect-error fetchpriority is valid HTML, not yet in React types
          fetchpriority={eager ? 'high' : 'low'}
          onLoad={() => { setLoaded(true); onLoad?.(); }}
          onError={() => onError?.()}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </div>
  );
}
