import { useEffect, useState, type ReactNode } from 'react';
import { Building2, Clock3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { INVENTORY_COLLECTION_PHASE, INVENTORY_NOTICE_KEY, INVENTORY_TOOL_EVENT, inventoryToolLocked, showInventoryComingSoon } from '@/lib/inventoryCollection';

export function InventoryCollectionBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(INVENTORY_NOTICE_KEY) === '1'; } catch { return false; }
  });
  if (!INVENTORY_COLLECTION_PHASE || dismissed) return null;
  return <aside aria-label="שלב אגירת נכסים" dir="rtl" className="flex items-start gap-3 border-b border-border bg-muted/40 px-3 py-3 text-foreground sm:items-center">
    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
    <div className="min-w-0 flex-1 text-sm leading-relaxed">
      <p className="font-semibold">שלב אגירת נכסים</p>
      <p className="text-muted-foreground">אנחנו נמצאים כרגע בתהליך של אגירת נכסים בפריסה רחבה ומגוונת, עם מתווכים מובילים ובעלי נכסים. בקרוב מאוד נפתח את הברז גם לשותפים.</p>
    </div>
    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="סגירת הודעת אגירת נכסים" title="סגירת ההודעה" onClick={() => {
      setDismissed(true);
      try { localStorage.setItem(INVENTORY_NOTICE_KEY, '1'); } catch { /* Optional preference. */ }
    }}><X className="h-4 w-4" /></Button>
  </aside>;
}

export function InventoryComingSoonHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(INVENTORY_TOOL_EVENT, show);
    return () => window.removeEventListener(INVENTORY_TOOL_EVENT, show);
  }, []);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent dir="rtl" className="max-w-md text-right">
      <Clock3 className="h-7 w-7 text-primary" aria-hidden="true" />
      <DialogHeader className="text-right">
        <DialogTitle>בקרוב, יחד עם רשת השותפים</DialogTitle>
        <DialogDescription className="text-base leading-relaxed">הכלי נמצא כרגע בהכנה וייפתח בקרוב לצד רשת השותפים. בינתיים אפשר להמשיך לעיין בנכסים, לייבא מודעות, לערוך טיוטות ולהכין אותן לפרסום.</DialogDescription>
      </DialogHeader>
      <Button className="justify-self-end" onClick={() => setOpen(false)}>הבנתי</Button>
    </DialogContent>
  </Dialog>;
}

/** Visible controls keep their layout, while pointer and keyboard actions stop before their handlers. */
export function InventoryToolSoftLock({ tool, children, showLabel = true }: { tool: string; children: ReactNode; showLabel?: boolean }) {
  if (!inventoryToolLocked(tool)) return <>{children}</>;
  return <div className="relative" onClickCapture={event => { event.preventDefault(); event.stopPropagation(); showInventoryComingSoon(tool); }}
    onKeyDownCapture={event => { if (event.key === 'Tab') return; event.preventDefault(); event.stopPropagation(); showInventoryComingSoon(tool); }}
    onPointerDownCapture={event => { event.preventDefault(); event.stopPropagation(); }}>
    {showLabel && <div className="mb-2 flex justify-end"><Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" title="ייפתח בקרוב לצד רשת השותפים"><Clock3 className="h-3.5 w-3.5" />בקרוב</Button></div>}
    {children}
  </div>;
}