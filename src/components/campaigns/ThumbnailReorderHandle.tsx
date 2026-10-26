import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThumbnailReorderHandle({ index, onMove, onTarget }: {
  index: number; onMove: (from: number, to: number) => void; onTarget: (index: number | null) => void;
}) {
  const destination = useRef(index);
  return <Button type="button" size="icon" variant="ghost"
    className="h-8 w-full touch-none rounded-none cursor-grab active:cursor-grabbing"
    aria-label={`שינוי סדר תמונה ${index + 1}`} title="גרירה לשינוי סדר"
    onPointerDown={e => { destination.current = index; e.currentTarget.setPointerCapture(e.pointerId); onTarget(index); }}
    onPointerMove={e => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-thumbnail-index]');
      if (!target || target.parentElement !== e.currentTarget.parentElement?.parentElement) return;
      const next = Number(target.dataset.thumbnailIndex);
      if (Number.isInteger(next)) { destination.current = next; onTarget(next); }
    }}
    onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); onMove(index, destination.current); onTarget(null); }}
    onPointerCancel={() => onTarget(null)}
    onKeyDown={e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); onMove(index, index + (e.key === 'ArrowLeft' ? 1 : -1));
      }
    }}><GripVertical className="h-4 w-4 rotate-90" /></Button>;
}