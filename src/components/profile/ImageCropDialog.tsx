import { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { croppedImageFile } from '@/lib/imageCrop';

export function ImageCropDialog({ file, aspect, title, onCancel, onConfirm }: {
  file: File;
  aspect: number;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const [source, setSource] = useState('');
  const [crop, setCrop] = useState<PercentCrop>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const confirm = async () => {
    if (!imageRef.current || !crop || busy || failed) return;
    setBusy(true);
    try {
      const result = await croppedImageFile(imageRef.current, crop, file.name);
      if (result.size > 5 * 1024 * 1024) throw new Error('התמונה החתוכה גדולה מדי (מקסימום 5MB)');
      await onConfirm(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'חיתוך התמונה נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div dir="ltr" className="flex min-h-32 items-center justify-center overflow-hidden rounded-md bg-muted">
          {failed ? <p className="p-4 text-sm text-destructive">לא ניתן לפתוח את התמונה. יש לבחור קובץ אחר.</p> : source && (
            <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} aspect={aspect} minWidth={24} minHeight={24} disabled={busy}>
              <img
                ref={imageRef}
                src={source}
                alt="תמונה לחיתוך"
                className="block max-h-[55dvh] max-w-full object-contain"
                onLoad={(event) => {
                  const { width, height } = event.currentTarget;
                  setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height));
                }}
                onError={() => setFailed(true)}
              />
            </ReactCrop>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={confirm} disabled={busy || failed || !crop || crop.width <= 0 || crop.height <= 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
            {busy ? 'מעלה…' : 'חיתוך והעלאה'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}