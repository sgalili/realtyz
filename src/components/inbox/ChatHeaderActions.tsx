import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ChatHeaderActions({ children }: { children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="פעולות שיחה" title="פעולות שיחה"><MoreVertical className="h-5 w-5" /></Button></PopoverTrigger><PopoverContent align="end" dir="rtl" className="flex w-64 flex-col gap-1 p-2 [&>button]:h-11 [&>button]:w-full [&>button]:justify-start [&>button]:gap-2">{children}</PopoverContent></Popover>;
}