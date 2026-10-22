import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { setPendingSignupRole } from '@/lib/signupRole';

/** Partner program pitch shown to signed-out visitors who tap affiliate or sharing actions. */
export function JoinPartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const join = () => {
    setPendingSignupRole('partner');
    window.location.assign('/auth');
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
      <DialogHeader>
        <DialogTitle className="text-right text-2xl font-extrabold">משתפים נכסים ומרוויחים</DialogTitle>
        <DialogDescription className="text-right text-base text-foreground">הצטרפו בחינם לתוכנית השותפים של TORAFF.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-right">
        <div>
          <p className="mb-1.5 font-bold text-primary">איך זה עובד</p>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            <li>נרשמים בחינם בדקה אחת, עם שם וטלפון.</li>
            <li>בוחרים נכסים מהלוח ומשתפים קישור אישי בווטסאפ, ברשתות או בקבוצות.</li>
            <li>ריטה מטפלת בפניות, מסננת ומעבירה למפרסם.</li>
          </ol>
        </div>
        <ul className="space-y-1.5 text-sm">
          <li>💰 תגמול על כל פנייה איכותית שמגיעה דרככם</li>
          <li>🏠 גישה לכל הנכסים הפתוחים לרשת השותפים</li>
          <li>📊 מעקב שקוף אחרי קליקים, פניות והכנסות</li>
          <li>🤖 פרסום אוטומטי בקבוצות פייסבוק מהענן</li>
        </ul>
        <Button className="h-12 w-full text-lg font-bold" onClick={join}>הצטרפות מהירה כשותף</Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)}>אולי אחר כך</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
