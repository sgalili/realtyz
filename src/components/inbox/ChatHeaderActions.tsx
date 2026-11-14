import { useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ChatHeaderActions({ children, label = 'פעולות שיחה' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return <span className="inline-flex shrink-0" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={label} title={label}><MoreVertical className="h-5 w-5" /></Button></PopoverTrigger><PopoverContent forceMount align="end" dir="rtl" onCloseAutoFocus={event => event.preventDefault()} onClickCapture={event => { const button = (event.target as HTMLElement).closest('button'); if (button && !button.disabled) queueMicrotask(() => setOpen(false)); }} className="flex w-72 flex-col gap-1 p-2 data-[state=closed]:hidden [&>button]:h-11 [&>button]:w-full [&>button]:justify-start [&>button]:gap-2 [&>button]:text-base">{children}</PopoverContent></Popover></span>;
}