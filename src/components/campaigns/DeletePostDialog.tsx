// Confirmation dialog for deleting a published social post.
// Lets the broker choose between removing the record only from the app
// database, or also wiping the live post off the connected Facebook Page.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertTriangle, Database, Facebook } from 'lucide-react';

export type DeleteMode = 'db' | 'both';

export function DeletePostDialog({
  open,
  onOpenChange,
  hasExternalPost,
  hasSeries = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** True when the post exists on the social network (has an external post id). */
  hasExternalPost: boolean;
  hasSeries?: boolean;
  /** Should throw an Error with a readable message on failure. */
  onConfirm: (mode: DeleteMode, entireSeries: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<DeleteMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entireSeries, setEntireSeries] = useState(false);

  useEffect(() => {
    if (open) { setBusy(null); setError(null); setEntireSeries(false); }
  }, [open]);

  const run = async (mode: DeleteMode) => {
    setBusy(mode);
    setError(null);
    try {
      await onConfirm(mode, entireSeries);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'המחיקה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> מחיקת פוסט
          </DialogTitle>
          <DialogDescription>
            {hasExternalPost
              ? 'איך למחוק את הפוסט? ניתן למחוק רק מהמערכת, או גם מעמוד הפייסבוק.'
              : 'לפוסט הזה אין מזהה פרסום ברשת החברתית — הוא יימחק מהמערכת בלבד.'}
          </DialogDescription>
        </DialogHeader>

        {hasSeries && (
          <div className="space-y-2">
            <p className="text-sm font-medium">למחוק רק את הפוסט הנוכחי או את כל הסדרה?</p>
            <div className="flex min-w-0 gap-2">
              <Button className="flex-1" variant={entireSeries ? 'outline' : 'default'} disabled={!!busy} onClick={() => setEntireSeries(false)}>הפוסט הנוכחי בלבד</Button>
              <Button className="flex-1" variant={entireSeries ? 'destructive' : 'outline'} disabled={!!busy} onClick={() => setEntireSeries(true)}>כל הסדרה והפוסטים שלה</Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-destructive">המחיקה נכשלה</div>
              <div className="text-muted-foreground break-words">{error}</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={!!busy}
            onClick={() => run('db')}
          >
            {busy === 'db' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {entireSeries ? 'מחק לצמיתות את כל הסדרה מהמערכת' : 'מחק לצמיתות מהמערכת בלבד'}
          </Button>

          {hasExternalPost && (
            <Button
              variant="destructive"
              className="w-full justify-start gap-2"
              disabled={!!busy}
              onClick={() => run('both')}
            >
              {busy === 'both' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              מחק מפייסבוק וגם מהמערכת
            </Button>
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeletePostDialog;
