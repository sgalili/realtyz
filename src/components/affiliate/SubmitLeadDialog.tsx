// "Submit lead for property" — the affiliate's core quick action.
//
// Captures a warm lead against a specific marketplace property and snapshots
// the three commission tiers as they were offered at submission time.
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';
import {
  listingTiers,
  useSubmitAffiliateLead,
  type MarketplaceListing,
} from '@/hooks/useAffiliate';

export function SubmitLeadDialog({ listing }: { listing: MarketplaceListing }) {
  const submit = useSubmitAffiliateLead();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          הגשת מתעניין לנכס
        </Button>
      </DialogTrigger>

      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            הגשת מתעניין · {listing.property_title || 'נכס'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <CommissionTierBadges tiers={listingTiers(listing)} />

          <div className="space-y-1.5">
            <Label>שם המתעניין</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>טלפון</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05X-XXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>אימייל</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="name@mail.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>הערות ורמת חימום</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="מה המתעניין מחפש, מתי פנוי לסיור, תקציב"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            תגמול שלב 1 נצבר עם ההגשה. שלב 2 נצבר לאחר אימות אנושי של המתווך, ושלב 3 בסגירת העסקה.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
          <Button
            disabled={submit.isPending || !name.trim() || !(phone.trim() || email.trim())}
            onClick={() =>
              submit.mutate(
                {
                  listing,
                  leadName: name.trim(),
                  leadPhone: phone.trim(),
                  leadEmail: email.trim(),
                  notes: notes.trim(),
                },
                {
                  onSuccess: () => {
                    toast.success('המתעניין הוגש למתווך');
                    setOpen(false);
                    reset();
                  },
                  onError: () => toast.error('ההגשה נכשלה, נסו שוב'),
                },
              )
            }
          >
            {submit.isPending ? 'שולח...' : 'הגשת מתעניין'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubmitLeadDialog;
