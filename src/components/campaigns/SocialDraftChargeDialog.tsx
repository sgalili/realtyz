import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SOCIAL_DRAFT_CONFIRM_EVENT, type DraftConfirmation } from '@/lib/socialDraftGeneration';

export function SocialDraftChargeDialog() {
  const queue = useRef<DraftConfirmation[]>([]);
  const [current, setCurrent] = useState<DraftConfirmation | null>(null);
  const currentRef = useRef<DraftConfirmation | null>(null);
  const advance = () => { const next = queue.current.shift() ?? null; currentRef.current = next; setCurrent(next); };
  useEffect(() => {
    const receive = (event: Event) => {
      queue.current.push((event as CustomEvent<DraftConfirmation>).detail);
      if (!currentRef.current) advance();
    };
    window.addEventListener(SOCIAL_DRAFT_CONFIRM_EVENT, receive);
    return () => { window.removeEventListener(SOCIAL_DRAFT_CONFIRM_EVENT, receive); currentRef.current?.resolve(false); queue.current.forEach(item => item.resolve(false)); };
  }, []);
  const answer = (approved: boolean) => { currentRef.current?.resolve(approved); advance(); };
  return <Dialog open={!!current} onOpenChange={open => { if (!open) answer(false); }}>
    <DialogContent dir="rtl" className="max-w-md">
      <DialogHeader><DialogTitle>יצירת נוסחים נוספים</DialogTitle>
        <DialogDescription>יצירת שלוש טיוטות נוספות לפוסט תחויב ב־2 קרדיטים נוספים. להמשיך?</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => answer(false)}>ביטול</Button><Button onClick={() => answer(true)}>אישור חיוב של 2 קרדיטים</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}