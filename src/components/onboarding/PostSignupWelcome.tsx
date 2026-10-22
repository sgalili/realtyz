import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { readPostSignupWelcome, clearPostSignupWelcome, type SignupRole } from '@/lib/signupRole';

const BENEFITS: Record<SignupRole, { welcome: string; items: string[] }> = {
  property_seeker: { welcome: 'ברוכים הבאים! כאן תמצאו או תמכרו נכס בקלות.', items: ['חיפוש נכסים מכל הלוח במקום אחד', 'פרסום נכס למכירה בחינם', 'ריטה עונה לפניות בשבילכם 24/7'] },
  property_owner: { welcome: 'ברוכים הבאים! כאן תשכירו או תמצאו דירה מהר יותר.', items: ['פרסום נכס להשכרה בחינם', 'רשת שותפים שמביאה שוכרים איכותיים', 'סינון פניות אוטומטי לפי השאלות שלכם'] },
  developer: { welcome: 'ברוכים הבאים! הפרויקטים שלכם מקבלים רשת שיווק שלמה.', items: ['ייבוא פרויקטים ויחידות מיד2', 'מתווכים ושותפים משווקים בשבילכם', 'תשלום רק על לידים ועסקאות'] },
  contractor: { welcome: 'ברוכים הבאים! הפרויקטים שלכם מקבלים רשת שיווק שלמה.', items: ['ייבוא פרויקטים ויחידות מיד2', 'מתווכים ושותפים משווקים בשבילכם', 'תשלום רק על לידים ועסקאות'] },
  broker: { welcome: 'ברוכים הבאים! המשרד שלכם מתחבר לרשת השותפים.', items: ['גישה לנכסים ופרויקטים של יזמים לשיווק', '80% מעמלות הסגירה על לידים שהבאתם', 'ריטה ואוטומציית פייסבוק עובדות בשבילכם'] },
  partner: { welcome: 'ברוכים הבאים לתוכנית השותפים!', items: ['משתפים נכסים ומרוויחים עמלות על כל ליד', 'קישורים אישיים עם מעקב מלא', 'הכנסה פאסיבית בלי צורך ברישיון'] },
};

export function PostSignupWelcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<SignupRole | null>(null);
  useEffect(() => {
    if (!user) return;
    const check = () => setRole(readPostSignupWelcome());
    check();
    const t = window.setTimeout(check, 1500);
    return () => window.clearTimeout(t);
  }, [user]);
  if (!user || !role) return null;
  const b = BENEFITS[role];
  const personal = ['partner', 'property_owner', 'property_seeker'].includes(role);
  const close = () => { clearPostSignupWelcome(); setRole(null); };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent dir="rtl" className="max-w-md text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl">{b.welcome}</DialogTitle>
          <DialogDescription>מה מחכה לכם ב-TORAFF:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {b.items.map((i) => <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{i}</span></li>)}
        </ul>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />בונים אמון ברשת</div>
          <p className="text-sm text-muted-foreground">{personal ? 'מומלץ להשלים את הפרטים האישיים. אין צורך בשם חברה או משרד.' : 'מומלץ להשלים עכשיו את פרטי המשרד/החברה והפרטים האישיים.'} פרופיל מלא מעורר אמון אצל שותפים ולקוחות ומגדיל את סיכויי שיתופי הפעולה.</p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => { close(); navigate(personal ? '/profile?tab=personal' : '/profile?tab=workspace'); }}>השלמת פרטים</Button>
          <Button variant="ghost" onClick={close}>אחר כך</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
