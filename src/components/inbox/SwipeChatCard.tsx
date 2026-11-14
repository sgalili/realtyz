import { useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatFavoriteButton } from './ChatFavoriteButton';
import type { InboxFavoriteKind } from '@/hooks/useInboxFavorites';

export function SwipeChatCard({ children, actions, kind, id, onDelete, autopilot, onAutopilot, busy = false }: { children: ReactNode; actions?: ReactNode; kind: InboxFavoriteKind; id: string; onDelete: () => void; autopilot: boolean; onAutopilot?: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const reduced = useReducedMotion();
  return <div className="relative isolate overflow-hidden" data-swipe-chat>
    <div aria-hidden={!open} className={`absolute inset-y-0 right-0 flex w-36 items-stretch ${open ? '' : 'invisible'}`}>
      <Button variant="destructive" className="h-full w-12 rounded-none" aria-label="מחיקת שיחה" title="מחיקת שיחה" onClick={onDelete}><Trash2 className="h-5 w-5" /></Button>
      <div className="flex w-12 items-center justify-center bg-warning text-warning-foreground [&_button]:h-full [&_button]:w-12 [&_button]:rounded-none [&_svg]:text-warning-foreground"><ChatFavoriteButton kind={kind} id={id} /></div>
      <Button className="h-full w-12 rounded-none bg-primary text-primary-foreground" aria-label={autopilot ? 'כיבוי ריטה' : 'הפעלת ריטה'} title={onAutopilot ? 'מענה אוטומטי של ריטה' : 'מענה אוטומטי בקהילה אינו זמין'} aria-pressed={autopilot} disabled={busy || !onAutopilot} onClick={onAutopilot}><Bot className={`h-5 w-5 ${autopilot ? '' : 'opacity-50'}`} /></Button>
    </div>
    <motion.div animate={{ x: open ? -144 : 0 }} transition={{ duration: reduced ? 0 : 0.2 }} className="relative bg-card [touch-action:pan-y]" onPointerDown={event => { start.current = { x: event.clientX, y: event.clientY }; swiped.current = false; }} onPointerMove={event => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x, dy = event.clientY - start.current.y;
      if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (event.pointerType === 'touch') event.currentTarget.setPointerCapture(event.pointerId); swiped.current = true; setOpen(dx < 0); }
    }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }} onClickCapture={event => { if (swiped.current || open) { event.preventDefault(); event.stopPropagation(); if (!swiped.current) setOpen(false); swiped.current = false; } }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft') setOpen(true); if (event.key === 'Escape' || event.key === 'ArrowRight') setOpen(false); }} tabIndex={0} aria-label="כרטיס שיחה"><div className={actions ? '[&>*]:pl-14' : undefined}>{children}</div>{actions && <div data-card-actions className="absolute left-1 top-1">{actions}</div>}</motion.div>
  </div>;
}