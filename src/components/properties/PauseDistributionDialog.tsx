import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Pause } from 'lucide-react';

export function PauseDistributionDialog({ open, busy, onOpenChange, onConfirm }: { open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return <AlertDialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <AlertDialogContent dir="rtl" className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto rounded-lg">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-xl">להפסיק את הפצת הנכס?</AlertDialogTitle>
        <AlertDialogDescription className="text-start text-base leading-relaxed">
          השהיית ההפצה מסירה את הנכס מהלוח הציבורי ומלוחות השותפים. הנכס לא ישווק, יפורסם או ישותף מעתה באף ערוץ או לוח שותפים בתוך פלטפורמת TORAFF.
          <span className="mt-3 block">הנכס והגדרות התמחור יישארו בנכסים שלי. פרסומים והודעות שכבר נשלחו אינם נמחקים.</span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>ביטול</Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}אישור הפסקת הפצה</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}