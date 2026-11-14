import { useNavigate } from 'react-router-dom';
import { MessageCircle, Pencil, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import VoterAvatar from '@/components/VoterAvatar';
import { useLeadProfileAccess } from '@/hooks/useLeadProfileAccess';
import { formatPhoneDisplay } from '@/lib/formatPhone';

/** A client is not a platform account: expose only its authorized, minimal projection. */
export function LeadPublicProfile({ leadId, onClose, onManage }: { leadId: string | null; onClose: () => void; onManage?: (id: string) => void }) {
  const access = useLeadProfileAccess(leadId);
  const navigate = useNavigate();
  const p = access.data;
  return <Dialog open={!!leadId} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir="rtl" className="max-w-md" aria-describedby={undefined}>
      <DialogTitle className="sr-only">פרופיל</DialogTitle>
      {access.isLoading ? <p className="text-center text-muted-foreground">טוען פרופיל…</p> : !p ? <p role="alert" className="text-center text-muted-foreground">הפרופיל אינו זמין</p> : <div className="flex min-w-0 flex-col items-center gap-3 text-center">
        <VoterAvatar fullName={p.full_name} profilePictureUrl={p.avatar_url} className="h-24 w-24" />
        <h2 className="max-w-full break-words text-xl font-bold">{p.full_name || 'לקוח'}</h2>
        {p.city && <p className="text-muted-foreground">{p.city}</p>}
        {p.phone_number && <p dir="ltr">{formatPhoneDisplay(p.phone_number)}</p>}
        <div className="!mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => { onClose(); navigate(`/inbox?lead=${encodeURIComponent(p.id)}`); }}><MessageCircle className="h-4 w-4" />שליחת הודעה</Button>
          {p.phone_number && <Button asChild variant="outline"><a href={`tel:${p.phone_number}`}><Phone className="h-4 w-4" />חיוג</a></Button>}
          {p.can_manage && <Button variant="outline" onClick={() => { if (onManage) onManage(p.id); else { onClose(); navigate(`/lead-crm/${p.id}?manage=1`); } }}><Pencil className="h-4 w-4" />עריכה / ניהול</Button>}
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}