import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Horizontal snap slider with arrows, counter and thumbnail strip (RTL safe). */
export default function PropertyGallerySlider({ photos, alt, onFavorite }: { photos: string[]; alt: string; onFavorite?: () => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

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
      <div className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted text-sm text-muted-foreground">
        <ImageOff className="h-6 w-6" />אין תמונות
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="group relative overflow-hidden rounded-xl bg-muted">
        <div ref={trackRef} dir="rtl" className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth sm:aspect-[16/7] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((src, i) => (
            <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-start">
              <img src={src} alt={`${alt} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
        {onFavorite && (
          <Button type="button" size="icon" variant="secondary" onClick={onFavorite} aria-label="שמירה במועדפים" className="absolute left-3 top-3 h-9 w-9 rounded-full bg-background/90 text-destructive shadow">
            <Heart className="h-5 w-5" />
          </Button>
        )}
        {photos.length > 1 && (
          <>
            <Button type="button" size="icon" variant="secondary" aria-label="תמונה קודמת" onClick={() => goTo(index - 1)} className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-md">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button type="button" size="icon" variant="secondary" aria-label="תמונה הבאה" onClick={() => goTo(index + 1)} className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-md">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-bold tabular-nums text-foreground shadow">{index + 1}/{photos.length}</span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div dir="rtl" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {photos.map((src, i) => (
            <button key={`t-${src}-${i}`} type="button" onClick={() => goTo(i)} aria-label={`תמונה ${i + 1}`}
              className={cn('h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity', i === index ? 'border-primary opacity-100' : 'border-transparent opacity-60 hover:opacity-100')}>
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
