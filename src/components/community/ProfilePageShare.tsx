import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Mail, Share2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { useIsMobile } from '@/hooks/use-mobile';
import { publicProfileShare, useNativeProfileShare } from '@/lib/publicProfileShare';
import { useBrokersOnly } from '@/hooks/usePlatformMode';

export function ProfilePageShare({ path, title, agency = false }: { path: string; title: string; agency?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();
  const brokersOnly = useBrokersOnly();
  const details = publicProfileShare(path, title, brokersOnly ? 'brokers_only' : 'full_marketplace');
  const label = agency ? 'שיתוף עמוד המשרד' : 'שיתוף הפרופיל';

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.realtyz-main-surface');
    const update = () => {
      if (button.current) button.current.style.top = `${Math.max(8, (surface?.getBoundingClientRect().top ?? 0) + 8)}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    if (surface) observer.observe(surface);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const share = async () => {
    if (useNativeProfileShare(isMobile, window.matchMedia('(pointer: coarse)').matches, typeof navigator.share === 'function')) {
      try {
        await navigator.share({ title: details.title, text: details.text, url: details.url });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setOpen(true);
      }
      return;
    }
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details.url);
      setCopied(true);
      toast.success('הקישור הועתק בהצלחה!');
    } catch {
      toast.error('העתקת הקישור נכשלה, נסו שוב');
    }
  };

  return createPortal(
    <>
      <Button ref={button} size="icon" variant="ghost" aria-label={label} title="שיתוף" onClick={() => void share()} className="fixed right-4 top-4 z-40 h-11 w-11 rounded-full bg-background text-foreground shadow-xs">
        <Share2 className="h-[22px] w-[22px]" />
      </Button>
      <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setCopied(false); }}>
        <DialogContent dir="rtl" className="sm:max-w-md" aria-describedby="profile-share-description">
          <DialogHeader>
            <DialogTitle className="text-xl">{label}</DialogTitle>
            <DialogDescription id="profile-share-description" className="break-words text-base">{title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 text-base">
              <a href={details.whatsapp} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-5 w-5" />שיתוף בוואטסאפ</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 text-base">
              <a href={details.sms}><Smartphone className="h-5 w-5" />שיתוף ב־SMS</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full justify-start gap-3 text-base">
              <a href={details.email}><Mail className="h-5 w-5" />שיתוף במייל</a>
            </Button>
            <Button type="button" variant="default" size="lg" className="w-full justify-start gap-3 text-base" onClick={() => void copy()} aria-live="polite">
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}{copied ? 'הקישור הועתק בהצלחה!' : 'העתקת קישור'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>,
    document.body,
  );
}
