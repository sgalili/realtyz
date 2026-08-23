import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LifeBuoy } from 'lucide-react';

/**
 * Channels Realtyz publishes to natively (direct Meta Graph / internal
 * gateways). Everything else still requires a managed aggregator account and
 * must be enabled manually by support.
 */
export const NATIVE_CHANNEL_IDS = new Set<string>([
  'facebook',
  'instagram',
  'whatsapp',
  'email',
  'ivr',
  'ai-call',
]);

export const isNativeChannel = (id: string) => NATIVE_CHANNEL_IDS.has(String(id || '').toLowerCase());

export function SupportRequiredDialog({
  channelLabel,
  open,
  onOpenChange,
}: {
  channelLabel: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-right">
            <LifeBuoy className="h-5 w-5 text-primary" />
            נדרש חיבור דרך התמיכה
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            החיבור ל{channelLabel ?? 'ערוץ הזה'} מחייב חשבון מנוהל חיצוני שאינו נפתח אוטומטית.
            יש לפנות לתמיכה של Realtyz כדי להפעיל את הערוץ עבור החשבון שלך.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button asChild>
            <a href="https://wa.me/972559966999" target="_blank" rel="noopener noreferrer">פנייה לתמיכה</a>
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
