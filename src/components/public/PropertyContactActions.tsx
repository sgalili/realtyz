import { useState } from 'react';
import { ClipboardList, Loader2, Phone } from 'lucide-react';
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
 */
export default function PropertyContactActions({ listingId, title, options }: { listingId: string; title: string; options?: ContactOptions | null }) {
  const settings = options ?? { digital: true, whatsapp: false, phone: false };
  const showDigital = settings.digital === true && settings.whatsapp !== true;
  const questions = (Array.isArray(settings.questions) ? settings.questions : []).filter((q) => q.trim()).slice(0, 8);
  const [mode, setMode] = useState<'digital' | 'phone' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const ref = new URLSearchParams(window.location.search).get('ref');

  const waMessage = [
    `שלום, אשמח לקבל פרטים על ${title}.`,
    'ריטה, אפשר להתחיל?',
    ...(questions.length ? [] : ['אשמח שתשאלי אותי את שאלות הסינון.']),
  ].join(' ');

  const submit = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 9) {
      toast.error('יש למלא שם מלא ומספר טלפון תקין');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', {
      body: { action: mode === 'phone' ? 'callback' : 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), intent: mode, ref },
    });
    setSending(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(mode === 'phone' ? 'לא הצלחנו להתחיל שיחה כרגע' : 'שליחת הפרטים נכשלה');
      return;
    }
    toast.success(mode === 'phone' ? 'השיחה יוצאת אליכם עכשיו' : 'הפרטים נשלחו בהצלחה');
    setMode(null); setName(''); setPhone('');
  };

  return (
    <>
      <div className="sticky bottom-3 z-10 grid grid-cols-1 gap-2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur sm:grid-cols-3">
        {settings.whatsapp === true && <Button asChild className="bg-social-whatsapp text-success-foreground hover:bg-social-whatsapp/90"><a href={officialWaLink(waMessage)} target="_blank" rel="noreferrer"><WhatsAppIcon className="h-5 w-5" /><RitaAvatar className="h-6 w-6 border-0 ring-0" />שיחה עם ריטה</a></Button>}
        {settings.phone === true && <Button variant="outline" onClick={() => setMode('phone')}><Phone className="h-4 w-4" />חייגו אליי</Button>}
        {showDigital && <Button variant="outline" onClick={() => setMode('digital')}><ClipboardList className="h-4 w-4" />השארת פרטים</Button>}
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">{mode === 'phone' ? 'חזרה טלפונית' : 'השארת פרטים'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>שם מלא *</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>טלפון *</Label><Input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between"><Button variant="outline" onClick={() => setMode(null)}>ביטול</Button><Button disabled={sending} onClick={() => void submit()}>{sending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'phone' ? 'חייגו אליי' : 'שלחו לי פרטים נוספים'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
