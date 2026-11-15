import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Network, Bot, Megaphone, UserRound, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import { PageCloseButton } from '@/components/ui/page-close-button';

const slides = [
  { icon: Network, color: 'text-primary', title: 'רשת אחת. הרבה שותפים.', text: '׳טוראף׳ מחברת בין מתווכים, יזמים, בעלי נכסים ושותפים שמייצרים פניות איכותיות. מפרסמים נכסים, משתפים הזדמנויות ומתגמלים על תוצאות לפי התנאים שנקבעו מראש.' },
  { icon: Bot, color: 'text-success', title: 'ריטה עובדת איתכם', text: 'יצירת תוכן מושלם, טיפול בפניות, מעקב ושיווק באוטומציה מלאה. פחות מעבר בין מערכות שונות והרבה פחות עבודה ידנית של צוות שיווק ותפעול, גם כשהיום כבר נגמר.' },
  { icon: Building2, color: 'text-destructive', title: 'למתווכים וליזמים', text: 'מתווכים מנהלים נכסים ופניות ומשתפים פעולה לאחר אימות רישיון. יזמים מרכזים פרויקטים ודירות במסלול בתשלום, ומרחיבים את החשיפה דרך רשת השותפים.' },
  { icon: Megaphone, color: 'text-primary', title: 'לבעלי נכסים ולשותפים', text: 'בעלי נכסים מציגים נכס ומגדירים את תנאי הפרסום. שותפים משתפים מודעות מאושרות ויכולים לקבל תגמולים על פניות זכאיות. אין הבטחת הכנסה.' },
];
export default function AboutToraff() {
  const [index,setIndex] = useState(0);
  const navigate = useNavigate();
  const slide = slides[index];
  const Icon = slide.icon;
  return <main dir="rtl" data-no-hero-wave className="mx-auto flex min-h-[85dvh] max-w-3xl flex-col px-6 pb-16 pt-8 text-center">
    <PageCloseButton />
    <PlatformBrand className="mx-auto h-20" />
    <h1 className="mt-6 text-3xl font-extrabold">מה זה TORAFF</h1>
    <section className="flex flex-1 flex-col items-center justify-center py-8" aria-live="polite">
      <Icon className={`mb-6 h-24 w-24 ${slide.color}`} strokeWidth={1.5} />
      <h2 className="text-2xl font-bold">{slide.title}</h2>
      <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{slide.text}</p>
    </section>
    <div className="flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="העמוד הקודם" disabled={index===0} onClick={()=>setIndex(v=>v-1)}><ArrowRight /></Button><span className="text-sm text-muted-foreground">{index+1} / {slides.length}</span><Button variant="ghost" size="icon" aria-label="העמוד הבא" disabled={index===slides.length-1} onClick={()=>setIndex(v=>v+1)}><ArrowLeft /></Button></div>
    <Button className="mt-5 min-h-12 gap-2 text-lg" onClick={()=>navigate('/auth')}><UserRound className="h-5 w-5" />הרשמה חינם או כניסה</Button>
  </main>;
}