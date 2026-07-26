// Post image with a self-healing fallback chain.
// Facebook CDN URLs are signed (`oh=`/`oe=`) and expire, which is why campaign
// cards silently went blank. On the first load error we ask `cache-post-media`
// to mirror the original asset into the public `post-media-cache` bucket and
// swap in the permanent copy. Only after that fails do we show the placeholder.
import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const inflight = new Map<string, Promise<string[]>>();

async function resolveCached(campaignLogId: string, urls: string[]): Promise<string[]> {
  const key = `${campaignLogId}|${urls[0] ?? ''}`;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      supabase.functions
        .invoke('cache-post-media', { body: { campaign_log_id: campaignLogId, urls } })
        .then(({ data }) => (Array.isArray((data as any)?.cached) ? ((data as any).cached as string[]) : []))
        .catch(() => []),
    );
  }
  return inflight.get(key)!;
}

export function PostImage({
  src,
  campaignLogId,
  index = 0,
  className,
  fallbackClassName,
  alt = '',
}: {
  src?: string | null;
  campaignLogId: string;
  index?: number;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}) {
  const [current, setCurrent] = useState<string | null>(src ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(src ?? null);
    setFailed(false);
  }, [src]);

  const handleError = async () => {
    if (!src) { setFailed(true); return; }
    const cached = await resolveCached(campaignLogId, [src]);
    const next = cached[index] ?? cached[0];
    if (next && next !== current) setCurrent(next);
    else setFailed(true);
  };

  if (!current || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground',
          fallbackClassName ?? className,
        )}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
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
