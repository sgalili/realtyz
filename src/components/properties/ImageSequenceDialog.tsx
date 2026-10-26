import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function ImageSequenceDialog({ photos, current, onChange, alt = 'תמונת הנכס' }: { photos: string[]; current: string | null; onChange: (url: string | null) => void; alt?: string }) {
  const index = current ? photos.indexOf(current) : -1;
  const move = (delta: number) => {
    if (!photos.length) return;
    onChange(photos[(Math.max(0, index) + delta + photos.length) % photos.length]);
  };
  return <Dialog open={!!current} onOpenChange={open => { if (!open) onChange(null); }}>
    <DialogContent dir="rtl" className="max-w-4xl p-2" onKeyDown={event => { if (event.key === 'ArrowLeft') move(1); if (event.key === 'ArrowRight') move(-1); }}>
      <DialogTitle className="sr-only">{alt}</DialogTitle>
      <div className="relative">
        {current && <img src={current} alt={alt} className="max-h-[80dvh] w-full object-contain" />}
        {photos.length > 1 && <>
          <Button type="button" variant="secondary" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="תמונה קודמת" onClick={() => move(-1)}><ChevronRight /></Button>
          <Button type="button" variant="secondary" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2" aria-label="תמונה הבאה" onClick={() => move(1)}><ChevronLeft /></Button>
          <span dir="ltr" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground">{index + 1} / {photos.length}</span>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}