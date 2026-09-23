import { useState } from 'react';
import { ClipboardList, Loader2, Phone, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RitaAvatar } from '@/components/RitaAvatar';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink } from '@/lib/officialWa';
import { supabase } from '@/integrations/supabase/client';
import type { LeadContactOptions } from '@/lib/leadTiers';

export type ContactOptions = LeadContactOptions;

/**
 * Contact row on a public property page. Which actions appear is decided by the
 * publisher's lead prices (level 1 form, level 2 Rita chat, level 3 phone call)
 * and arrives here already resolved in `contact_options`.
 *
 * The share action lives in THIS row, next to the contact buttons, so every
 * property page shows one single row of primary actions.
 */
export default function PropertyContactActions({
  listingId,
  title,
  options,
  premsg,
  shareUrl,
  compact = false,
  showShare = true,
}: {
  listingId: string;
  title: string;
  options?: ContactOptions | null;
  premsg?: string | null;
  shareUrl?: string | null;
  compact?: boolean;
  showShare?: boolean;
}) {
  const settings = options ?? {};
  // A listing exposes one publisher-defined path only. Prefer the highest
  // configured tier when old records contain more than one true value.
  const primaryMode: 'digital' | 'whatsapp' | 'phone' | null = settings.phone === true
    ? 'phone'
    : settings.whatsapp === true
      ? 'whatsapp'
      : settings.digital === true
        ? 'digital'
        : null;
  const [mode, setMode] = useState<'digital' | 'phone' | 'whatsapp' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const ref = new URLSearchParams(window.location.search).get('ref');

  // Canonical opener built from the property row itself, so Rita can parse the
  // exact property (type, street + house number, city) with zero questions.
  const waMessage = premsg?.trim() || `היי ריטה, אשמח לקבל פרטים אודות ${title}.`;

  const share = async () => {
    const url = shareUrl?.trim() || (typeof window !== 'undefined' ? window.location.href : '');
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
    } catch {
      /* the visitor cancelled, or the clipboard is blocked */
    }
  };

  const submit = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 9) {
      toast.error('יש למלא שם מלא ומספר טלפון תקין');
      return;
    }
    if (mode === 'whatsapp') {
      // Save the contact in the background, then open the chat synchronously so
      // the browser never blocks the new tab.
      void supabase.functions.invoke('public-lead-gate', {
        body: { action: 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), intent: 'whatsapp', ref },
      });
      window.open(officialWaLink(`${waMessage} (${name.trim()})`), '_blank', 'noopener,noreferrer');
      setMode(null); setName(''); setPhone('');
      return;
    }
    const callback = mode === 'phone';
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', {
      body: { action: callback ? 'callback' : 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), intent: mode, ref },
    });
    setSending(false);

    // Callback requests NEVER show a failure to the visitor: the contact is
    // saved server-side and a failed AI call surfaces on the partner dashboard.
    if (!callback && (error || (data as { error?: string } | null)?.error)) {
      toast.error('שליחת הפרטים נכשלה');
      return;
    }
    toast.success(callback ? 'תודה, נחזור אליכם טלפונית בהקדם' : 'הפרטים נשלחו בהצלחה');
    setMode(null); setName(''); setPhone('');
  };

  return (
    <>
      <div className={compact ? 'flex w-full items-center gap-2' : 'sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur'}>
        {primaryMode === 'whatsapp' && (
          <Button className="min-w-[9rem] flex-1 bg-social-whatsapp text-success-foreground hover:bg-social-whatsapp/90" onClick={() => setMode('whatsapp')}>
            <>
              <WhatsAppIcon className="h-5 w-5" />
              שיחה עם ריטה
              {/* RTL: Rita's picture sits on the opposite (left) side of the label. */}
              <RitaAvatar className="h-6 w-6 border-0 ring-0" />
            </>
          </Button>
        )}
        {primaryMode === 'phone' && (
          <Button variant="outline" className="min-w-[8rem] flex-1" onClick={() => setMode('phone')}>
            <Phone className="h-4 w-4" />חייגו אליי
          </Button>
        )}
        {primaryMode === 'digital' && (
          <Button variant="outline" className="min-w-[8rem] flex-1" onClick={() => setMode('digital')}>
            <ClipboardList className="h-4 w-4" />השארת פרטים
          </Button>
        )}
        {showShare && <Button variant="outline" className="min-w-[8rem] flex-1" onClick={() => void share()}>
          <Share2 className="h-4 w-4" />שיתוף
        </Button>}
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">{mode === 'phone' ? 'חזרה טלפונית' : mode === 'whatsapp' ? 'שיחה עם ריטה' : 'השארת פרטים'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>שם מלא *</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>טלפון *</Label><Input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between"><Button variant="outline" onClick={() => setMode(null)}>ביטול</Button><Button disabled={sending} onClick={() => void submit()}>{sending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'phone' ? 'חייגו אליי' : mode === 'whatsapp' ? 'פתיחת צ׳אט בווטסאפ' : 'שלחו לי פרטים נוספים'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
