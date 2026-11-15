import { useEffect, useState, type CSSProperties } from 'react';

/** Keeps a floating chat inside the visible area when a mobile keyboard shrinks it. */
export function useVisualViewportBox(open: boolean, expanded = false): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const viewport = window.visualViewport;
    const measure = () => {
      const inset = expanded ? (window.innerWidth >= 640 ? 32 : 8) : 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const height = Math.max(0, viewportHeight - inset * 2);
      setStyle({ top: viewportTop + inset, height, maxHeight: height, bottom: 'auto' });
    };
    measure();
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, [open, expanded]);

  return style;
}
