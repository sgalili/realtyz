import { useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { brokerInvitation } from '@/lib/brokerInvitation';

export function BrokerInvitationDialog({ broker }: { broker: { id: string; full_name?: string | null } }) {
  const [open, setOpen] = useState(false);
  const invitation = brokerInvitation(broker);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success('ההזמנה הועתקה'); }
    catch { toast.error('לא ניתן להעתיק כרגע. אפשר לסמן ולהעתיק את ההודעה.'); }
  };
  return <>
    <Button type="button" size="icon" variant="ghost" aria-label={`הזמנת ${broker.full_name || 'מתווך'} ל-WhatsApp`} title="העתקת הזמנה ל-WhatsApp" onClick={() => setOpen(true)}><MessageCircle className="h-4 w-4 text-primary" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>הזמנה ל-TORAFF</DialogTitle></DialogHeader>
      <Textarea aria-label="הודעת הזמנה ל-WhatsApp" readOnly value={invitation.message} className="min-h-56" />
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => void copy(invitation.link)}><Copy className="h-4 w-4" />העתקת קישור</Button><Button onClick={() => void copy(invitation.message)}><Copy className="h-4 w-4" />העתקת הודעה</Button></div>
    </DialogContent></Dialog>
  </>;
}