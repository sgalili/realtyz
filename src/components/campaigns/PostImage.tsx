import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { resolveMediaUrls } from '@/lib/postMediaUrl';

const inflight = new Map<string, Promise<string[]>>();

// Always hand the <img> tag a fully-qualified URL: storage keys and relative
// paths get the public bucket base, JSON-object rows get unwrapped.
const cleanUrls = (urls: Array<unknown>): string[] => resolveMediaUrls(urls);


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
  const [current, setCurrent] = useState<string | null>(() => cleanUrls([src, ...candidates])[0] ?? null);
  const [attempt, setAttempt] = useState(0);

  const chain = cleanUrls([src, ...candidates]);

  useEffect(() => {
    setCurrent(cleanUrls([src, ...candidates])[0] ?? null);
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

    // No brand placeholder: try the durable mirror, otherwise keep the raw URL.
    if (chain.length === 0) return;
    const cached = await resolveCached(campaignLogId, chain);
    const next = cached[index] ?? cached[0];
    if (next && next !== current) setCurrent(next);
  };

  // Nothing to show: render an empty box, never a brand placeholder.
  if (!current) {
    return <span className={cn(className, fallbackClassName)} aria-hidden />;
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
