import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const inflight = new Map<string, Promise<string[]>>();
const BRAND_THUMBNAIL = '/__l5e/assets-v1/0c4787e2-7c2d-419f-b619-90d17f5a6b93/realtyz-logo-rect.png';

const cleanUrls = (urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of urls) {
    const url = typeof value === 'string' ? value.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
};

async function resolveCached(campaignLogId: string, urls: string[]): Promise<string[]> {
  const key = `${campaignLogId}|${urls.join('|')}`;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      supabase.functions
        .invoke('cache-post-media', { body: { campaign_log_id: campaignLogId, urls } })
        .then(({ data }) => (Array.isArray((data as any)?.cached) ? ((data as any).cached as string[]) : []))
        .catch(() => []),
    );
  }
  const pending = inflight.get(key);
  return pending ?? [];
}

export function PostImage({
  src,
  candidates = [],
  campaignLogId,
  index = 0,
  className,
  fallbackClassName,
  alt = '',
}: {
  src?: string | null;
  candidates?: string[];
  campaignLogId: string;
  index?: number;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}) {
  const [current, setCurrent] = useState<string | null>(() => cleanUrls([src, ...candidates])[0] ?? BRAND_THUMBNAIL);
  const [attempt, setAttempt] = useState(0);

  const chain = cleanUrls([src, ...candidates, BRAND_THUMBNAIL]);

  useEffect(() => {
    const next = cleanUrls([src, ...candidates])[0] ?? BRAND_THUMBNAIL;
    setCurrent(next);
    setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, candidates.join('|')]);

  const handleError = async () => {
    const nextRaw = chain[attempt + 1];
    if (nextRaw) {
      setAttempt((prev) => prev + 1);
      setCurrent(nextRaw);
      return;
    }

    const sourceUrls = chain.filter((url) => url !== BRAND_THUMBNAIL);
    if (sourceUrls.length === 0) {
      setCurrent(BRAND_THUMBNAIL);
      return;
    }
    const cached = await resolveCached(campaignLogId, sourceUrls);
    const next = cached[index] ?? cached[0];
    if (next && next !== current) setCurrent(next);
    else setCurrent(BRAND_THUMBNAIL);
  };

  if (!current) {
    return (
      <img
        src={BRAND_THUMBNAIL}
        alt={alt}
        loading="lazy"
        className={cn(className, fallbackClassName)}
      />
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
    />
  );
}
