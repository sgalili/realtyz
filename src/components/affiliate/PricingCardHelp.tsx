import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';

type PricingTier = 'form' | 'whatsapp' | 'phone' | 'closing';
const explanations: Record<PricingTier, string> = {
  form: 'השארת פרטים בעמוד נחיתה היא פנייה שבה המתעניין מוסר את פרטי הטופס שהוגדר במודעה. צפייה בעמוד או לחיצה על קישור אינן פנייה מזכה.',
  whatsapp: 'פנייה מסוננת בוואטסאפ מזכה רק לאחר זיהוי המתעניין והשלמת שאלות הסינון של המפרסם בתשובות משביעות רצון. פתיחת שיחה או הודעה ראשונה בלבד אינן מספיקות.',
  phone: 'פנייה מסוננת בטלפון מזכה רק לאחר זיהוי המתעניין ושיחה שבה הושלם הסינון הנדרש. בקשת חזרה או שיחה שלא נענתה אינן פנייה מסוננת.',
  closing: 'תגמול סגירה מותנה בסגירת העסקה בפועל, באימות הזכאות ובתנאי העסקה השמורים; הוא אינו תשלום על שיחה או על הפניה בלבד.',
};

export function PricingCardHelp({ tier, title, advertiser = false, className }: { tier: PricingTier; title: string; advertiser?: boolean; className?: string }) {
  const { user } = useAuth();
  const { isSuperAdmin, roles } = useUserRole();
  const { level4Unlocked } = useAffiliateLicense();
  const roleCopy = !user
    ? 'מחירי התגמולים האישיים זמינים לאחר כניסה ובהתאם לזכאות החשבון. אין התחייבות להכנסה מעצם ההצטרפות.'
    : advertiser
      ? 'כמפרסם הנכס, המחיר שבחרת הוא ההתחייבות שלך לפנייה תקפה מסוג זה. החיוב כפוף לתנאים ולמגבלות ששמרת; צפיות וקליקים אינם מחויבים כפניות.'
      : isSuperAdmin
        ? 'כמנהל מערכת ניתן לבדוק את התמחור המורשה. הרשאת הניהול כשלעצמה אינה יוצרת זכאות לתגמול או עוקפת תנאי עסקה.'
        : level4Unlocked
          ? 'בחשבון בעל זכאות תיווך מאומתת, הסכום המוצג הוא התגמול נטו בהתאם למסלול ולתנאים השמורים. זכאות לסגירה נבדקת בנפרד בעת השלמת העסקה.'
          : roles.includes('developer') || roles.includes('property_owner')
            ? 'בצפייה בנכס של מפרסם אחר, הסכום המוצג הוא תגמול ההפניה בהתאם לזכאות החשבון. הגדרת מחירים בנכסים שלך נעשית בחלון העריכה; עמלת סגירה אינה זמינה ללא זכאות תיווך מאומתת.'
            : 'כשותף משווק, התגמול המוצג כפוף להפניה מזוהה ולתנאי הפנייה השמורים. אין זכאות לעמלת סגירה ללא זכאות תיווך מאומתת.';
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className={className ?? 'h-8 w-8 shrink-0 text-muted-foreground'} aria-label={`הסבר תמחור: ${title}`} onClick={event => event.stopPropagation()}><CircleHelp className="h-5 w-5" /></Button></DialogTrigger>
    <DialogContent dir="rtl" className="max-h-[85dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto" onClick={event => event.stopPropagation()}>
      <DialogHeader className="px-6"><DialogTitle>{title}</DialogTitle><DialogDescription>כללי התמחור והזכאות בחשבון שלך</DialogDescription></DialogHeader>
      <div className="space-y-4 text-base leading-relaxed"><p>{explanations[tier]}</p><p>{roleCopy}</p><p>המפרסם קובע את המחיר. התמחור המחייב הוא זה שנשמר להפניה ולנכס; שינוי מאוחר במחיר אינו משנה תגמול שכבר ננעל. שדרוג פנייה מחושב לפי ההפרש שטרם שולם, ולא כחיוב כפול.</p></div>
    </DialogContent>
  </Dialog>;
}