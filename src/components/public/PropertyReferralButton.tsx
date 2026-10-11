import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { personalPropertyLink } from '@/lib/propertyReferral';

export default function PropertyReferralButton({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
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