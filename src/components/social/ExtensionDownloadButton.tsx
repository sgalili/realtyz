import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { readExtensionGroups } from '@/lib/extensionGroupBridge';

const EXT_INSTALLED_KEY = 'rz-ext-installed';
const ZIP_PATH = '/realtyz-extension.zip';

/** True once the companion extension has touched this page (or pushed groups). */
export const isExtensionInstalled = (): boolean => {
  try {
    if (document.documentElement.getAttribute('data-realtyz-extension') === '1') return true;
    if (localStorage.getItem(EXT_INSTALLED_KEY) === '1') return true;
  } catch { /* noop */ }
  return readExtensionGroups().length > 0;
};

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
    fetch(ZIP_PATH)
      .then((res) => {
        if (!res.ok) throw new Error(`הורדה נכשלה (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'realtyz-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
        setOpen(true);
      })
      .catch((err) => toast.error('הורדת התוסף נכשלה', { description: err?.message }));
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-disabled={installed}
        title={installed ? 'התוסף מותקן — לחיצה תוריד אותו מחדש' : 'הורד את תוסף סנכרון הקבוצות'}
        className={cn('h-8 gap-1 text-[12px]', installed && 'opacity-50', className)}
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
