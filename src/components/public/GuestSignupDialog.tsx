// Shown to unauthenticated guests when they tap a restricted board action
// (share, publish, favorite, ...). Offers a prominent free-registration CTA.
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

export function GuestSignupDialog({
  open,
  onOpenChange,
  returnTo,
  feature = 'פעולה זו',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path to return to after signing up. */
  returnTo?: string;
  /** Hebrew label of the blocked feature, e.g. "שיתוף נכס". */
  feature?: string;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md text-center">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-xl">נדרשת הרשמה חינם</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            כדי להשתמש ב{feature} יש להירשם בחינם לפלטפורמת TORAFF. ההרשמה מהירה ולוקחת פחות מדקה.
          </DialogDescription>
        </DialogHeader>
        <Button
          className="mt-2 w-full text-base font-bold"
          size="lg"
          onClick={() => {
            onOpenChange(false);
            navigate('/auth', { state: { returnTo, tab: 'signup' } });
          }}
        >
          הרשמה חינם
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default GuestSignupDialog;
