import { useState } from 'react';
import { ClipboardList, HelpCircle, Link2, Megaphone, ShieldCheck, Wallet, Inbox, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';

export function AffiliateProgramHelp() {
  const [open, setOpen] = useState(false);
  const { level4Unlocked } = useAffiliateLicense();
  const steps = [
    { icon: Megaphone, tone: 'text-primary', title: 'בוחרים נכס', text: 'ב״נכסים״ רואים נכסים שאושרו לשיווק ואת התגמולים שלהם. פתיחת המחיר מציגה את התנאים לפני שמתחילים.' },
    { icon: Link2, tone: 'text-success', title: 'משתפים קישור אישי', text: 'יוצרים קישור לנכס ומשתפים אותו. פניות דרך הקישור משויכות אליכם; ב״בשיווק״ עוקבים אחר הנכסים והכניסות.' },
    { icon: ClipboardList, tone: 'text-warning', title: 'מביאים ליד מתאים', text: 'התגמול תלוי בסוג הפנייה: שדות בטופס דף נחיתה, סינון ב־WhatsApp או שיחת טלפון, ובמילוי תנאי הנכס. אפשר גם להגיש ליד מתוך הנכס.' },
    { icon: Wallet, tone: 'text-success', title: 'עוקבים אחר הרווחים', text: 'ב״לידים״ רואים את ההגשות והתקדמותן; ב״רווחים״ את התגמולים שנצברו. רק תגמולים מאושרים מזוכים לפי תנאי התוכנית, ואין הבטחה להכנסה.' },
    { icon: Inbox, tone: 'text-primary', title: 'לידים עודפים', text: 'בלשונית הלידים, ״לידים עודפים״ מציגה פניות מעבר למכסה היומית. רכישתן נפרדת ואופציונלית, במחיר המוזל שקבע השותף.' },
    { icon: ShieldCheck, tone: 'text-warning', title: 'שיווק אמין ומאושר', text: 'מגישים פניות אמיתיות בלבד, ללא פניות עצמיות או כפולות. פרסום מתבצע רק לאחר אישור מפורש; זמינות האוטומציה תלויה בחיבורים הפעילים.' },
    { icon: Gift, tone: 'text-primary', title: 'מזמינים חברים', text: 'קישור הזמנה אישי מעניק לכם 5k קרדיטים ולחבר 2.5k קרדיטים, רק אחרי העסקה הראשונה שלו שאומתה ואושרה, לא בהרשמה בלבד.' },
  ];
  return <>
    <Button size="icon" variant="ghost" aria-label="איך עובד שיווק השותפים" title="איך עובד שיווק השותפים" onClick={() => setOpen(true)} className="h-9 w-9 rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
      <HelpCircle className="!h-5 !w-5" />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[85dvh] max-w-xl overflow-y-auto text-right">
        <DialogHeader><DialogTitle className="text-xl">איך עובד שיווק השותפים?</DialogTitle><DialogDescription>מהבחירה בנכס ועד התגמול, במקום אחד.</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          {steps.map(({ icon: Icon, tone, title, text }) => <section key={title} className="flex items-start gap-3"><Icon aria-hidden="true" className={`mt-0.5 h-6 w-6 shrink-0 ${tone}`} /><div className="min-w-0"><h3 className="text-base font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></section>)}
          {level4Unlocked && <p className="border-t pt-3 text-sm leading-relaxed text-muted-foreground">תגמול על סגירת עסקה מוצג לזכאים בלבד, בהתאם להרשאה ולתנאי הנכס, ומשולם לאחר אימות ואישור העסקה.</p>}
        </div>
        <Button onClick={() => setOpen(false)}>הבנתי</Button>
      </DialogContent>
    </Dialog>
  </>;
}