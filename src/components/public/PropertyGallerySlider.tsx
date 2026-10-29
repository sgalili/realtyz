import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ImageSequenceDialog } from '@/components/properties/ImageSequenceDialog';

/** Horizontal snap slider with arrows, counter and thumbnail strip (RTL safe). */
export default function PropertyGallerySlider({ photos, alt, onFavorite, overlay }: { photos: string[]; alt: string; onFavorite?: () => void; overlay?: ReactNode }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [enlarged, setEnlarged] = useState<string | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      setIndex(Math.min(photos.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / w))));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [photos.length]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el || !photos.length) return;
    const next = (i + photos.length) % photos.length;
    const slide = el.children[next] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setIndex(next);
  };

  if (!photos.length) {
    return (
      <div className="min-w-0 space-y-2" onClick={(event) => event.stopPropagation()}>
      <div data-property-image-toolbar className="flex min-h-10 items-center justify-end gap-1">{overlay}{onFavorite && !overlay && <Button type="button" variant="ghost" size="icon" onClick={onFavorite} aria-label="שמירה במועדפים"><Heart className="h-5 w-5 text-destructive" /></Button>}</div>
      <div className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted text-sm text-muted-foreground">
        <ImageOff className="h-6 w-6" />אין תמונות
      </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="group relative overflow-hidden rounded-lg bg-muted">
        <div ref={trackRef} dir="rtl" className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth sm:aspect-[16/7] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((src, i) => (
            <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-start">
              <Button type="button" variant="ghost" aria-label={`הגדלת תמונה ${i + 1}`} className="h-full w-full p-0" onClick={() => setEnlarged(src)}><img src={src} alt={`${alt} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover" /></Button>
            </div>
          ))}
        </div>
        {(overlay || onFavorite) && <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/70 p-0.5">{overlay}{onFavorite && !overlay && <Button type="button" size="icon" variant="ghost" onClick={onFavorite} aria-label="שמירה במועדפים" className="h-9 w-9 text-destructive"><Heart className="h-5 w-5" /></Button>}</div>}
        {photos.length > 1 && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/70 px-2 py-1 text-xs font-semibold tabular-nums text-foreground">{index + 1}/{photos.length}</span>}
      </div>
      <ImageSequenceDialog photos={photos} current={enlarged} onChange={setEnlarged} alt={alt} />
      {photos.length > 1 && (
        <div dir="rtl" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {photos.map((src, i) => (
            <Button variant="ghost" key={`t-${src}-${i}`} type="button" onClick={() => goTo(i)} aria-label={`תמונה ${i + 1}`}
              className={cn('h-14 w-20 p-0 shrink-0 overflow-hidden rounded-md border-2 transition-opacity', i === index ? 'border-primary opacity-100' : 'border-transparent opacity-60 hover:opacity-100')}>
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
