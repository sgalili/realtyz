import type { ReactNode } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortablePhoto = { id: string; content: ReactNode; actions?: ReactNode };

function Tile({ photo, primary, onMakePrimary, showPrimary }: { photo: SortablePhoto; primary: boolean; onMakePrimary: () => void; showPrimary: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      className={cn('relative aspect-video cursor-grab touch-none select-none overflow-hidden rounded-md border bg-muted active:cursor-grabbing', primary && 'ring-2 ring-primary', isDragging && 'z-10 opacity-80 shadow-lg')}>
      {photo.content}
      {showPrimary && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (!primary) onMakePrimary(); }}
        aria-label={primary ? 'תמונה ראשית' : 'הגדרה כתמונה ראשית'} title={primary ? 'תמונה ראשית' : 'הגדרה כתמונה ראשית'}
        className={cn('absolute start-1 top-1 flex h-7 items-center gap-1 rounded-full bg-background/85 px-2 text-[11px] font-semibold', primary ? 'text-primary' : 'text-muted-foreground')}>
        <Star className={cn('h-3.5 w-3.5', primary && 'fill-current')} />{primary && 'ראשית'}
      </button>}
      {photo.actions && <div onPointerDown={(e) => e.stopPropagation()}>{photo.actions}</div>}
    </div>
  );
}

/** Drag tiles to reorder; the first tile is the primary photo. */
export function SortablePhotoGrid({ photos, onMove, className, showPrimary = true }: { photos: SortablePhoto[]; onMove: (from: number, to: number) => void; className?: string; showPrimary?: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = photos.findIndex(p => p.id === active.id), to = photos.findIndex(p => p.id === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
        <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
          {photos.map((photo, i) => <Tile key={photo.id} photo={photo} primary={i === 0} onMakePrimary={() => onMove(i, 0)} showPrimary={showPrimary} />)}
        </div>
        {showPrimary && photos.length > 1 && <p className="mt-1 text-xs text-muted-foreground">גררו תמונה לשינוי הסדר · לחיצה על הכוכב קובעת תמונה ראשית</p>}
      </SortableContext>
    </DndContext>
  );
}
