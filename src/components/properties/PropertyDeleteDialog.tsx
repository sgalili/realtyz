import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function PropertyDeleteDialog({
  count,
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle>{count > 1 ? `למחוק ${count} נכסים לצמיתות?` : 'למחוק את הנכס לצמיתות?'}</AlertDialogTitle>
          <AlertDialogDescription>
            הפעולה אינה ניתנת לביטול ותסיר גם שיתופי שותפים, הפניות וקישורים המשויכים {count > 1 ? 'לנכסים האלה' : 'לנכס הזה'}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start">
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'מוחק…' : 'מחיקה לצמיתות'}
          </AlertDialogAction>
          <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}