// Post image with an aggressive, self-healing fallback chain.
//
// Facebook CDN URLs are signed (`oh=`/`oe=`) and expire, which is why campaign
// cards silently went blank. The resolution order is now:
//   1. the stored URL (skipped immediately when missing/blank/known-placeholder)
//   2. a permanent mirror produced by `cache-post-media`
//   3. the linked property's primary photo from `listings.media_photos`
//   4. the Realtyz brand thumbnail — we never render a broken-image icon
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import brandThumb from '@/assets/realtyz-logo-rect.png';

const inflight = new Map<string, Promise<string[]>>();
const listingPhotos = new Map<string, Promise<string[]>>();

function isUsable(url?: string | null): url is string {
  if (!url) return false;
  const u = String(url).trim();
  if (!u || u === 'null' || u === 'undefined') return false;
  return /^(https?:|data:|blob:|\/)/.test(u);
}

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

async function resolveListingPhotos(listingId: string): Promise<string[]> {
  if (!listingPhotos.has(listingId)) {
    listingPhotos.set(
      listingId,
      supabase
        .from('listings')
        .select('media_photos')
        .eq('id', listingId)
        .maybeSingle()
        .then(({ data }) => {
          const raw = (data as any)?.media_photos;
          return Array.isArray(raw)
            ? raw.map((p: any) => (typeof p === 'string' ? p : p?.url)).filter(isUsable)
            : [];
        })
        .catch(() => [] as string[]),
    );
  }
  return listingPhotos.get(listingId)!;
}

export function PostImage({
  src,
  campaignLogId,
  listingId,
  fallbackSrcs,
  index = 0,
  className,
  fallbackClassName,
  alt = '',
}: {
  src?: string | null;
  campaignLogId: string;
  /** Linked property — its primary photo is used when the post media is gone. */
  listingId?: string | null;
  /** Extra candidates tried before the brand thumbnail. */
  fallbackSrcs?: (string | null | undefined)[];
  index?: number;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}) {
  // `stage` marks how far down the chain we already walked, so a repeated
  // onError can never loop back onto a URL we already know is dead.
  const [current, setCurrent] = useState<string>(() => (isUsable(src) ? src : ''));
  const [stage, setStage] = useState<'src' | 'mirror' | 'listing' | 'brand'>(
    isUsable(src) ? 'src' : 'mirror',
  );

  useEffect(() => {
    setCurrent(isUsable(src) ? src : '');
    setStage(isUsable(src) ? 'src' : 'mirror');
  }, [src]);

  // When there is no usable URL at all, walk the chain up-front instead of
  // waiting for an onError that will never fire on an empty <img>.
  useEffect(() => {
    if (current) return;
    let cancelled = false;
    (async () => {
      const next = await nextCandidate(stage);
      if (!cancelled) applyCandidate(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, stage]);

  async function nextCandidate(from: typeof stage): Promise<{ url: string; stage: typeof stage }> {
    if (from === 'src' || from === 'mirror') {
      if (isUsable(src)) {
        const cached = await resolveCached(campaignLogId, [src]);
        const hit = cached[index] ?? cached[0];
        if (isUsable(hit) && hit !== current) return { url: hit, stage: 'listing' };
      }
      const extra = (fallbackSrcs ?? []).find((u) => isUsable(u) && u !== current);
      if (extra) return { url: extra as string, stage: 'listing' };
    }
    if (from !== 'brand' && listingId) {
      const photos = await resolveListingPhotos(listingId);
      const hit = photos[index] ?? photos[0];
      if (isUsable(hit) && hit !== current) return { url: hit, stage: 'brand' };
    }
    return { url: brandThumb, stage: 'brand' };
  }

  function applyCandidate(next: { url: string; stage: typeof stage }) {
    setCurrent(next.url);
    setStage(next.stage);
  }

  const handleError = async () => {
    if (stage === 'brand') return;
    applyCandidate(await nextCandidate(stage));
  };

  const isBrand = current === brandThumb;

  if (!current) {
    return <div className={cn('rounded-lg bg-muted animate-pulse', fallbackClassName ?? className)} />;
  }

  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleError}
      className={cn(className, isBrand && 'object-contain bg-muted p-2')}
    />
  );
}
