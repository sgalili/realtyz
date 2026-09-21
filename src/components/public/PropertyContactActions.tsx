import { useState } from 'react';
import { ClipboardList, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RitaAvatar } from '@/components/RitaAvatar';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink } from '@/lib/officialWa';
import { supabase } from '@/integrations/supabase/client';

export type ContactOptions = {
  digital?: boolean;
  whatsapp?: boolean;
  phone?: boolean;
  questions?: string[];
};

export default function PropertyContactActions({ listingId, title, options }: { listingId: string; title: string; options?: ContactOptions | null }) {
  const settings = options ?? { digital: true, whatsapp: true, phone: false };
  const [mode, setMode] = useState<'digital' | 'phone' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 9 || (mode === 'digital' && !comment.trim())) {
      toast.error(mode === 'digital' ? 'יש למלא שם מלא, טלפון והערה' : 'יש למלא שם מלא ומספר טלפון תקין');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', { body: { action: mode === 'phone' ? 'callback' : 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), comment: comment.trim(), intent: mode } });
    setSending(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(mode === 'phone' ? 'לא הצלחנו להתחיל שיחה כרגע' : 'שליחת הפרטים נכשלה');
      return;
    }
    toast.success(mode === 'phone' ? 'השיחה יוצאת אליכם עכשיו' : 'הפרטים נשלחו בהצלחה');
    setMode(null); setName(''); setPhone(''); setComment('');
  };

  return (
    <>
      <div className="sticky bottom-3 z-10 grid grid-cols-1 gap-2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur sm:grid-cols-3">
        {settings.whatsapp !== false && <Button asChild className="bg-social-whatsapp text-success-foreground hover:bg-social-whatsapp/90"><a href={officialWaLink(`שלום, אשמח לקבל פרטים על ${title}`)} target="_blank" rel="noreferrer"><WhatsAppIcon className="h-5 w-5" /><RitaAvatar className="h-6 w-6 border-0 ring-0" />WhatsApp</a></Button>}
        {settings.phone && <Button variant="outline" onClick={() => setMode('phone')}><Phone className="h-4 w-4" />חייגו אליי</Button>}
        {settings.digital !== false && <Button variant="outline" onClick={() => setMode('digital')}><ClipboardList className="h-4 w-4" />השארת פרטים</Button>}
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">{mode === 'phone' ? 'חזרה טלפונית' : 'השארת פרטים'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>שם מלא *</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>טלפון *</Label><Input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
            {mode === 'digital' && <div><Label>הערה *</Label><Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></div>}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between"><Button variant="outline" onClick={() => setMode(null)}>ביטול</Button><Button disabled={sending} onClick={() => void submit()}>{sending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'phone' ? 'חייגו אליי' : 'שליחה'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}