import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Download, FileText, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type MediaKind = 'audio' | 'video' | 'image' | 'document' | 'sticker';

export interface ChatMedia {
  kind: MediaKind;
  /** WhatsApp Cloud API media id (proxied through the wa-media function). */
  mediaId?: string | null;
  /** Direct URL when the provider already gave us a playable link. */
  directUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}

/**
 * Extract a playable media descriptor from a message row's metadata.
 * Supports the Meta Cloud API webhook shape (metadata.raw.<type>.id) and
 * providers that hand us a direct URL (metadata.media_url / raw.*.link).
 */
export function extractChatMedia(msg: any): ChatMedia | null {
  const meta = (msg?.metadata ?? {}) as Record<string, any>;
  const raw = (meta.raw ?? {}) as Record<string, any>;
  const kinds: MediaKind[] = ['audio', 'video', 'image', 'document', 'sticker'];
  const type = String(raw.type ?? meta.message_type ?? '').toLowerCase();

  const pick = (k: MediaKind): ChatMedia | null => {
    const node = raw[k] ?? (meta[k] as any);
    const directUrl =
      meta.media_url ?? node?.link ?? (typeof node?.url === 'string' && node.url.startsWith('http') ? null : null);
    const mediaId = node?.id ? String(node.id) : null;
    if (!mediaId && !directUrl) return null;
    return {
      kind: k,
      mediaId,
      directUrl: directUrl ?? null,
      mimeType: node?.mime_type ?? null,
      fileName: node?.filename ?? null,
    };
  };

  if (kinds.includes(type as MediaKind)) {
    const hit = pick(type as MediaKind);
    if (hit) return hit;
  }
  for (const k of kinds) {
    const hit = pick(k);
    if (hit) return hit;
  }
  return null;
}

function proxyUrl(media: ChatMedia): string | null {
  if (media.directUrl) return media.directUrl;
  if (!media.mediaId) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${base}/functions/v1/wa-media?media_id=${encodeURIComponent(media.mediaId)}`;
}

const kindLabel: Record<MediaKind, string> = {
  audio: 'הודעה קולית',
  video: 'סרטון',
  image: 'תמונה',
  document: 'מסמך',
  sticker: 'סטיקר',
};

/** Media bubble body with a play/pause icon button for any playable file. */
export function MediaMessage({ media }: { media: ChatMedia }) {
  const rawSrc = useMemo(() => proxyUrl(media), [media]);
  // Proxied WhatsApp media requires the signed-in session, so fetch it with
  // the access token and play it from a local object URL.
  const [src, setSrc] = useState<string | null>(media.directUrl ?? null);
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'unavailable' | 'authorization' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setSrc(null);
    setFetchState('loading');
    if (!rawSrc || rawSrc === media.directUrl) { setSrc(rawSrc); setFetchState(rawSrc ? 'ready' : 'unavailable'); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { if (!cancelled) setFetchState('error'); return; }
      const res = await fetch(rawSrc, { signal: controller.signal, headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (cancelled) return;
      if (res.headers.get('content-type')?.includes('application/json')) {
        const result = await res.json();
        if (!cancelled) setFetchState(result.reason === 'authorization_required' || result.error === 'media_credentials_missing' ? 'authorization' : result.available === false ? 'unavailable' : 'error');
        return;
      }
      if (!res.ok) { setFetchState('error'); return; }
      const blob = await res.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
      setFetchState('ready');
    })().catch(() => { if (!cancelled) setFetchState('error'); });
    return () => { cancelled = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [rawSrc, media.directUrl, retry]);
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setFailed(false);
  }, [src]);

  if (!src) {
    return <div role="status" className="flex items-center gap-2 text-sm leading-relaxed">
      {fetchState === 'loading' && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      <span>{kindLabel[media.kind]} · {fetchState === 'loading' ? 'טוען…' : fetchState === 'authorization' ? 'נדרש חידוש הרשאת WhatsApp כדי לטעון את הקובץ' : fetchState === 'unavailable' ? 'הקובץ אינו זמין עוד ב־WhatsApp' : 'לא ניתן לטעון את הקובץ כרגע'}</span>
      {fetchState === 'error' && <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="נסה לטעון שוב" title="נסה לטעון שוב" onClick={() => setRetry(v => v + 1)}><RotateCcw className="h-4 w-4" /></Button>}
    </div>;
  }

  if (media.kind === 'image' || media.kind === 'sticker') {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={src}
          alt={kindLabel[media.kind]}
          loading="lazy"
          className="max-h-64 w-full rounded-md object-cover"
        />
      </a>
    );
  }

  if (media.kind === 'document') {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm underline-offset-2 hover:underline"
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{media.fileName || 'מסמך'}</span>
        <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </a>
    );
  }

  const isVideo = media.kind === 'video';

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      setLoading(true);
      void el
        .play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'עצור' : 'נגן'}
          title={playing ? 'עצור' : 'נגן'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-whatsapp-header text-whatsapp-header-foreground transition-opacity hover:opacity-90"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {failed ? 'לא ניתן לנגן את הקובץ' : kindLabel[media.kind]}
          </p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-whatsapp-header transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {isVideo ? (
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          src={src}
          playsInline
          preload="metadata"
          className="max-h-64 w-full rounded-md bg-black/80"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress((el.currentTime / el.duration) * 100);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <audio
          ref={ref as React.RefObject<HTMLAudioElement>}
          src={src}
          preload="metadata"
          className="hidden"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress((el.currentTime / el.duration) * 100);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
