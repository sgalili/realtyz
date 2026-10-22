import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { JoinPartnerDialog } from '@/components/affiliate/JoinPartnerDialog';
import { personalPropertyLink } from '@/lib/propertyReferral';

export default function PropertyReferralButton({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  if (!user) return <><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="הצטרפות לתוכנית השותפים" aria-label="שיתוף והרווחה כשותף" onClick={(event) => { event.stopPropagation(); setJoinOpen(true); }} onKeyDown={(event) => event.stopPropagation()}><Link2 className="h-4 w-4" /></Button><JoinPartnerDialog open={joinOpen} onOpenChange={setJoinOpen} /></>;
  const copy = async () => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(await personalPropertyLink(listingId));
      toast.success('הקישור האישי הועתק');
    } catch { toast.error('לא ניתן להעתיק קישור אישי לנכס זה'); }
    finally { setBusy(false); }
  };
  return <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={busy} title="העתקת קישור שותף אישי" aria-label="העתקת קישור שותף אישי" onClick={(event) => { event.stopPropagation(); void copy(); }} onKeyDown={(event) => event.stopPropagation()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}</Button>;
}