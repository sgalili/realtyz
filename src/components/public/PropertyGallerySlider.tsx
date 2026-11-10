import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Heart, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ImageSequenceDialog } from '@/components/properties/ImageSequenceDialog';

/** Horizontal snap slider with arrows, counter and thumbnail strip (RTL safe). */
export default function PropertyGallerySlider({ photos, alt, onFavorite, overlay, share, isMine = false }: { photos: string[]; alt: string; onFavorite?: () => void; overlay?: ReactNode; share?: ReactNode; isMine?: boolean }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const gesture = useRef<{ x: number; y: number; top: number; owner: HTMLElement | null; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

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
    if (slide) el.scrollTo({ left: -next * el.clientWidth, behavior: 'smooth' });
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
        <div ref={trackRef} data-property-gallery dir="rtl" className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth touch-pan-y sm:aspect-[16/7] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={event => {
            let owner = event.currentTarget.parentElement;
            while (owner && !(owner.scrollHeight > owner.clientHeight && /auto|scroll/.test(getComputedStyle(owner).overflowY))) owner = owner.parentElement;
            gesture.current = { x: event.clientX, y: event.clientY, top: owner?.scrollTop ?? 0, owner, moved: false };
            suppressClick.current = false;
          }}
          onPointerMove={event => {
            const start = gesture.current;
            if (!start || event.pointerType !== 'mouse' || event.buttons !== 1) return;
            const dy = event.clientY - start.y;
            if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(event.clientX - start.x)) {
              start.moved = true; suppressClick.current = true;
              if (start.owner) start.owner.scrollTop = start.top - dy;
              else window.scrollBy(0, -event.movementY);
            }
          }}
          onPointerUp={event => {
            const start = gesture.current; gesture.current = null;
            if (!start) return;
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { suppressClick.current = true; goTo(index + (dx > 0 ? 1 : -1)); }
            else if (Math.abs(dy) > 6) suppressClick.current = true;
          }}
          onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
          {photos.map((src, i) => (
            <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-start">
              <Button type="button" variant="ghost" aria-label={`הגדלת תמונה ${i + 1}`} className="h-full w-full touch-pan-y p-0" onClick={() => setEnlarged(src)}><img src={src} alt={`${alt} ${i + 1}`} draggable={false} loading={i === 0 ? 'eager' : 'lazy'} className="h-full w-full select-none object-cover" /></Button>
            </div>
          ))}
        </div>
        {(overlay || onFavorite) && <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/70 p-0.5">{overlay}{onFavorite && !overlay && <Button type="button" size="icon" variant="ghost" onClick={onFavorite} aria-label="שמירה במועדפים" className="h-9 w-9 text-destructive"><Heart className="h-5 w-5" /></Button>}</div>}
        {share && <div className="absolute bottom-2 left-2 z-10">{share}</div>}
        {photos.length > 1 && <div className="absolute bottom-2 right-2 z-10 flex items-center rounded-full bg-white/70"><Button type="button" size="icon" variant="ghost" aria-label="תמונה קודמת" onClick={() => goTo(index - 1)} className="h-8 w-8 rounded-full hover:bg-transparent"><ChevronRight className="h-4 w-4" /></Button><span className="px-0.5 text-xs font-semibold tabular-nums text-foreground" dir="ltr">{index + 1}/{photos.length}</span><Button type="button" size="icon" variant="ghost" aria-label="תמונה הבאה" onClick={() => goTo(index + 1)} className="h-8 w-8 rounded-full hover:bg-transparent"><ChevronLeft className="h-4 w-4" /></Button></div>}
        {isMine && <span title="המודעה שלי" aria-label="המודעה שלי" className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-semibold text-success"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />שלי</span>}
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
