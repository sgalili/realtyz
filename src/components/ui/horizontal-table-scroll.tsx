import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HorizontalTableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  return <div className="min-w-0 w-full max-w-full">
    {overflow && <div className="flex items-center justify-end gap-1 border-b border-border bg-background px-1 py-0.5" dir="ltr">
      <Button variant="ghost" size="icon" className="h-6 w-7" title="גלילה שמאלה" aria-label="גלילה שמאלה" onClick={() => ref.current?.scrollBy({ left: -240 })}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-6 w-7" title="גלילה ימינה" aria-label="גלילה ימינה" onClick={() => ref.current?.scrollBy({ left: 240 })}><ChevronRight className="h-4 w-4" /></Button>
    </div>}
    <div ref={ref} data-table-scroll tabIndex={overflow ? 0 : undefined} role={overflow ? 'region' : undefined} aria-label={overflow ? 'טבלה בגלילה אופקית' : undefined} className="relative w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]" onKeyDown={event => {
      if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -120 : 120 });
    }}>{children}</div>
  </div>;
}