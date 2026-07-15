import { useCallback, useMemo, useState } from 'react';

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|avif)(\?|#|$)/i;

export function normalizeImageUrls(values: unknown[]): string[] {
  // Hard-override: trust the URLs coming from the DB. Only drop empty/non-URL strings.
  // Do NOT filter for "placeholder"/"default" — those checks were hiding real photos.
  return Array.from(new Set(
    values
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((url) => {
        if (!url) return false;
        if (/^(data:image\/|blob:)/i.test(url)) return true;
        if (/^https?:\/\//i.test(url)) return true;
        if (/^\/(?!\/)/.test(url)) return true;
        return false;
      }),
  ));
}

export function looksLikeImageUrl(url: string): boolean {
  return /^(data:image\/|blob:)/i.test(url) || IMAGE_EXT_RE.test(url) || /storage\/v1\/object|homely-media|fbcdn|scontent|image|photo|pic|gallery/i.test(url);
}

export function useVisibleImageUrls(urls: unknown[]) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const visible = useMemo(
    () => normalizeImageUrls(urls).filter((url) => !broken.has(url)),
    [urls, broken],
  );
  const markBroken = useCallback((url: string) => {
    setBroken((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);
  return { visible, markBroken };
}