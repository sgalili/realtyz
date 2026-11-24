import { Building2, ClipboardList, Eye, FileSignature, LogIn, MessageCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router-compat';
import ritaAvatar from '@/assets/rita-avatar.jpg';

const benefits = [
  { icon: Building2, title: 'הנכסים שלך, מסודרים', text: 'ניהול נכסים וייבוא מיד2, בלי להזין הכול מחדש.' },
  { icon: MessageCircle, title: 'ריטה מטפלת בפניות', text: 'שיחות, בירור צרכים ומעקב אחר לידים במקום אחד.' },
  { icon: ClipboardList, title: 'יום עבודה בשליטה', text: 'משימות, סיורים וקמפיינים בפייסבוק ובוואטסאפ.' },
  { icon: FileSignature, title: 'חתימות בלי ניירת', text: 'שליחת מסמכים לחתימה ומעקב אחר הסטטוס.' },
];

export function BrokerGuestHome() {
  return <section dir="rtl" data-no-hero-wave className="mx-auto w-full max-w-3xl py-3 sm:py-7">
    <div className="border-b border-border pb-6 sm:pb-8">
      <p className="mb-2 text-sm font-medium text-primary">סביבת העבודה של המתווך</p>
      <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl">TORAFF</h1>
      <p className="mt-3 max-w-xl text-xl leading-relaxed text-foreground">יותר זמן ללקוחות. פחות עבודה מסביב.</p>
      <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">הנכסים, הפניות והמשימות שלך במקום אחד, עם ריטה לצידך.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <Button asChild className="h-12 gap-2 px-5 text-base"><Link to="/auth?mode=signup"><UserPlus className="h-5 w-5" />הרשמה חינם</Link></Button>
        <Button asChild variant="outline" className="h-12 gap-2 px-5 text-base"><Link to="/auth?mode=login"><LogIn className="h-5 w-5" />התחברות</Link></Button>
        <Button asChild variant="secondary" className="col-span-2 h-12 gap-2 px-5 text-base"><a href="/demo/broker/properties"><Eye className="h-5 w-5" />כניסה למרחב דמו</a></Button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">כבר נפתח לך חשבון או התקבל מייל מאיתנו? אפשר להתחבר עם מספר הנייד וקוד אימות.</p>
    </div>
    <div className="grid gap-x-8 sm:grid-cols-2">
      {benefits.map(({icon: Icon,title,text}) => <div key={title} className="flex gap-3 border-b border-border py-5">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div>
      </div>)}
    </div>
    <div className="flex items-center gap-3 py-5">
      <img src={ritaAvatar} alt="ריטה" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      <p className="text-sm leading-relaxed text-muted-foreground">אפשר להתחיל בהדגמה, להכיר את ריטה ולהתרשם לפני ההרשמה.</p>
    </div>
  </section>;
}