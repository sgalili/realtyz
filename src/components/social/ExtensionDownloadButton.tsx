import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { downloadExtension, isExtensionInstalled } from '@/lib/extensionDetect';

// Re-exported for existing callers; the logic lives in @/lib/extensionDetect.
export { isExtensionInstalled };

/**
 * "תוסף" — one-click download of the pre-packaged Chrome extension.
 * Rendered dimmed (but still clickable) once the extension is detected, so a
 * broker can always re-install it.
 */
export function ExtensionDownloadButton({ className }: { className?: string }) {
  const [installed, setInstalled] = useState(() => isExtensionInstalled());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setInstalled(isExtensionInstalled()), 3000);
    return () => window.clearInterval(id);
  }, []);

  const download = () => {
    void downloadExtension().then((ok) => {
      if (ok) setOpen(true);
      else toast.error('הורדת התוסף נכשלה');
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        title={installed ? 'התוסף מותקן — לחיצה תוריד אותו מחדש' : 'הורד את תוסף סנכרון הקבוצות'}
        className={cn('h-8 gap-1 text-[12px]', className)}
        onClick={download}
      >
        <Download className="h-3.5 w-3.5" /> תוסף
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>התקנת תוסף סנכרון הקבוצות</DialogTitle>
            <DialogDescription>שני שלבים, פעם אחת בלבד:</DialogDescription>
          </DialogHeader>
          <ol className="list-inside list-decimal space-y-1 text-[15px] leading-relaxed text-muted-foreground">
            <li>חלץ את הקובץ realtyz-extension.zip לתיקייה קבועה במחשב.</li>
            <li>
              פתח chrome://extensions/ , הפעל "מצב פיתוח" (Developer mode) ולחץ "טען תוסף לא ארוז" (Load unpacked) ובחר
              את התיקייה שחילצת.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ExtensionDownloadButton;
