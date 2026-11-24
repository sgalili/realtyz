import { useRef, useState, type TouchEvent } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { Building2, Network, Bot, Megaphone, UserRound, ArrowLeft, ArrowRight, CalendarCheck, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrokersOnly } from '@/hooks/usePlatformMode';

const marketplaceSlides = [
  { icon: Network, color: 'text-destructive', title: 'סביבת עבודה לאנשי מקצוע', text: '׳טוראף׳ היא סביבת עבודה דיגיטלית ומאובטחת לאנשי מקצוע בנדל״ן: רשת שיתוף פעולה עסקית וכלי ניהול בסגנון MLS ו-CRM. כל הנכסים ברשת מנוהלים, מפורסמים או מסונכרנים על ידי המתווכים והמשרדים עצמם, כחלק מהמלאי המקצועי והסכמי שיתוף הפעולה שלהם.' },
  { icon: Network, color: 'text-destructive', title: 'רשת אחת. הרבה שותפים.', text: '׳טוראף׳ מחברת בין מתווכים, יזמים, בעלי נכסים ושותפים שמייצרים פניות איכותיות. מפרסמים נכסים, משתפים הזדמנויות ומתגמלים על תוצאות לפי התנאים שנקבעו מראש.' },
  { icon: Bot, color: 'text-destructive', title: 'ריטה עובדת איתכם', text: 'יצירת תוכן מושלם, טיפול בפניות, מעקב ושיווק באוטומציה מלאה. פחות מעבר בין מערכות שונות והרבה פחות עבודה ידנית של צוות שיווק ותפעול, גם כשהיום כבר נגמר.' },
  { icon: Building2, color: 'text-destructive', title: 'ליזמים ומתווכים', text: 'יזמים ומתווכים מאומתים מנהלים בקלות את כל הנכסים, הפרסומים, השיתופים והלידים בממשק פשוט וקל. רשת השותפים של טוראף מפיצה ומרחיבה את החשיפה דרך רשתות חברתיות ומייצרת לידים חמים ואיכותיים' },
  { icon: Megaphone, color: 'text-destructive', title: 'לבעלי נכסים ולשותפים', text: 'בעלי נכסים מפרסמים נכס ומגדירים את מחירי התגמולים לשותפים. השותפים מפיצים מודעות איכותיות של הנכס בכל ערוצי המדיה ומרוויחים את העמלות שנקבעו מראש עבור הלידים שהם מייצרים.' },
];
const brokerSlides = [
  { icon: Building2, color: 'text-primary', title: 'כל יום התיווך. במקום אחד.', text: 'TORAFF היא סביבת העבודה למתווכי נדל״ן ולמשרדי תיווך: הנכסים שלכם, הלידים, השיחות והמשימות במערכת אחת בעברית. פחות מעבר בין כלים, יותר זמן ללקוחות.' },
  { icon: Bot, color: 'text-destructive', title: 'ריטה עובדת איתכם', text: 'ריטה מסייעת בכתיבת תוכן לנכסים, במענה לפניות ובבירור צרכים לפי השאלות שהגדרתם. הלידים והשיחות מגיעים אליכם, ואתם שולטים בהרשאות ובמענה האוטומטי.' },
  { icon: Megaphone, color: 'text-primary', title: 'מהנכס לקמפיין', text: 'מוסיפים נכס או מייבאים מיד2, בודקים את הפרטים ומכינים קמפיין לפייסבוק או לוואטסאפ. בוחרים את הערוץ והנמענים ומאשרים לפני שליחה. חיבורים ופעילות כפופים להרשאות ולכללי הספק.' },
  { icon: CalendarCheck, color: 'text-destructive', title: 'אף פנייה לא הולכת לאיבוד', text: 'מרכזים לידים, סיורים, משימות, סיכומי שיחות והערות. לוח הבקרה מציג את פעילות המשרד כדי שתוכלו להתמקד במה שמצריך טיפול.' },
  { icon: FileSignature, color: 'text-primary', title: 'מהשיחה ועד החתימה', text: 'מנהלים מסמכים וחתימות דיגיטליות לצד העבודה השוטפת. ההרשמה חינם, מחירי פעולות בקרדיטים מוצגים לפני הביצוע, ואפשר להכיר את הכלים במרחב הדגמה לקריאה בלבד.' },
];
export default function AboutToraff() {
  const brokersOnly = useBrokersOnly();
  const slides = brokersOnly ? brokerSlides : marketplaceSlides;
  const [index,setIndex] = useState(0);
  const navigate = useNavigate();
  const slide = slides[index];
  const Icon = slide.icon;
  const touchX = useRef<number | null>(null);
  // RTL: swiping left advances, swiping right goes back.
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    setIndex(v => Math.max(0, Math.min(slides.length - 1, v + (dx < 0 ? 1 : -1))));
  };
  return <main dir="rtl" className="mx-auto flex min-h-[70dvh] max-w-3xl flex-col px-6 pb-16 pt-4 text-center">
    <h1 className="sr-only">מה זה TORAFF?</h1>
    <section className="flex flex-1 touch-pan-y select-none flex-col items-center justify-center py-8" aria-live="polite" onTouchStart={e => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
      <Icon className={`mb-6 h-[110px] w-[110px] ${slide.color}`} strokeWidth={0.5} />
      <h2 className="text-2xl font-bold">{slide.title}</h2>
      <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{slide.text}</p>
    </section>
    <div className="flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="העמוד הקודם" disabled={index===0} onClick={()=>setIndex(v=>v-1)}><ArrowRight /></Button><span dir="ltr" className="text-sm text-muted-foreground">{index+1}/{slides.length}</span><Button variant="ghost" size="icon" aria-label={index===slides.length-1 ? 'להרשמה' : 'העמוד הבא'} onClick={()=>index===slides.length-1 ? navigate('/auth', { state: { signup: true } }) : setIndex(v=>v+1)}><ArrowLeft /></Button></div>
    <Button className="mt-5 min-h-12 gap-2 text-lg" onClick={()=>navigate('/auth')}><UserRound className="h-5 w-5" />הרשמה חינם או כניסה</Button>
  </main>;
}