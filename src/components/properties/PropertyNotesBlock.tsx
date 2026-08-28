/**
 * Full-text property notes, printed under the property name in tables and cards.
 * Notes are NEVER truncated — the whole text is always visible.
 */
import { StickyNote } from 'lucide-react';
import { propertyNoteKindLabel, type PropertyNote } from '@/hooks/usePropertyNotes';

export function PropertyNotesBlock({
  notes,
  className,
}: {
  notes: PropertyNote[] | undefined;
  className?: string;
}) {
  if (!notes || notes.length === 0) return null;
  return (
    <div dir="rtl" className={`space-y-1 ${className ?? ''}`}>
      {notes.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200"
        >
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 whitespace-pre-wrap break-words">
            <span className="font-bold">{propertyNoteKindLabel(n.kind)}: </span>
            {n.content}
          </span>
        </div>
      ))}
    </div>
  );
}
