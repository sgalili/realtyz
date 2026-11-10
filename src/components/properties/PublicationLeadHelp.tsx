import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function PublicationLeadHelp() {
  return <Dialog><DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="absolute left-2 top-2 h-7 w-7" aria-label="הסבר על סוגי הפניות והתמחור" title="סוגי הפניות והתמחור"><CircleHelp className="h-5 w-5" /></Button></DialogTrigger><DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>סוגי הפניות והתמחור</DialogTitle></DialogHeader><div className="space-y-3 text-base leading-relaxed">
    <p><strong>טופס:</strong> שם וטלפון שנמסרו בטופס הנכס. מחיר הבסיס נקבע על ידך; שדות נוספים לפי ההגדרות עשויים להוסיף לחיוב.</p>
    <p><strong>וואטסאפ עם ריטה AI:</strong> פנייה בעלת זהות מאומתת שעברה בהצלחה את שאלות הסינון שקבעת.</p>
    <p><strong>שיחת טלפון עם ריטה AI:</strong> פנייה טלפונית מזוהה שסיימה סינון בהצלחה; פרטי השיחה נשמרים עם הפנייה.</p>
    <p>אין חיוב על צפייה, שיתוף, קליק או תחילת שיחה בלבד. שאלה נוספת מעבר לשלוש שאלות הבסיס מוסיפה ₪10; שדה טופס נוסף מוסיף ₪10 לפי ההגדרות.</p>
    <p>במעבר של אותה פנייה לסוג יקר יותר מחויב רק ההפרש, ללא חיוב כפול. שותפים שכבר בחרו בנכס ממשיכים לפי תנאי התגמול שננעלו עבורם.</p>
    <p>מגבלות הפניות וההוצאה חלות על 24 השעות האחרונות. פניות שמעבר למגבלת הסוג לא מחויבות אוטומטית; רכישה נפרדת שלהן כפופה גם למגבלת החשבון.</p>
    <p>עמלת הסגירה נפרדת ממחירי הפניות ומשולמת לפי תנאי התיווך רק לאחר סגירת עסקה.</p>
  </div></DialogContent></Dialog>;
}