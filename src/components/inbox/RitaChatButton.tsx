import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RitaAvatar } from '@/components/RitaAvatar';
import { RitaConversationPanel, type RitaConversationKind } from './RitaConversationPanel';

export function RitaChatButton({ kind, target, label = false }: { kind: RitaConversationKind; target: string; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size={label ? 'default' : 'icon'} variant="ghost" title="זימון ריטה לשיחה" aria-label="זימון ריטה לשיחה" onClick={() => setOpen(true)} className="h-9 shrink-0 gap-2"><RitaAvatar className="h-7 w-7" />{label && 'זימון ריטה לשיחה'}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="flex h-[min(640px,85dvh)] max-w-xl flex-col overflow-hidden p-0" aria-describedby={undefined}><DialogHeader className="px-4 pt-4"><DialogTitle>ריטה בשיחה</DialogTitle></DialogHeader><RitaConversationPanel key={`${kind}:${target}`} kind={kind} target={target} /></DialogContent></Dialog>
  </>;
}