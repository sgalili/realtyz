import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Body-level positioning avoids transformed page ancestors and follows the shell header. */
export function ProfilePageClose({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.realtyz-main-surface');
    const update = () => { if (button.current) button.current.style.top = `${Math.max(8, (surface?.getBoundingClientRect().top ?? 0) + 8)}px`; };
    update();
    const observer = new ResizeObserver(update);
    if (surface) observer.observe(surface);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return createPortal(<Button ref={button} size="icon" variant="ghost" aria-label="סגירה וחזרה לדף הקודם" title="סגירה" onClick={onClose} className="fixed left-4 top-4 z-40 h-11 w-11 rounded-full bg-background text-foreground shadow-sm"><X className="h-[22px] w-[22px]" /></Button>, document.body);
}