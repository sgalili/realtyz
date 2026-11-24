import { ArrowUpLeft, Building2, ClipboardList, Eye, FileSignature, LogIn, MessageCircle, Sparkles, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router-compat';
import ritaPointing from '@/assets/rita-pointing.webp';
import { BrandLogo } from '@/components/social/BrandLogo';

const benefits = [
  { icon: Building2, title: 'הנכסים שלך, מסודרים', text: 'ניהול נכסים וייבוא מיד2, בלי להזין הכול מחדש.' },
  { icon: MessageCircle, title: 'ריטה מטפלת בפניות', text: 'שיחות, בירור צרכים ומעקב אחר לידים במקום אחד.' },
  { icon: ClipboardList, title: 'יום עבודה בשליטה', text: 'משימות, סיורים וקמפיינים בפייסבוק ובוואטסאפ.' },
  { icon: FileSignature, title: 'חתימות בלי ניירת', text: 'שליחת מסמכים לחתימה ומעקב אחר הסטטוס.' },
];

export function BrokerGuestHome() {
  return <section dir="rtl" data-no-hero-wave className="broker-guest-welcome mx-auto w-full max-w-5xl pb-5">
    <div className="broker-guest-intro relative isolate overflow-hidden px-5 pb-0 pt-7 sm:px-10 sm:pt-10">
      <div aria-hidden="true" className="broker-guest-art pointer-events-none absolute inset-0 overflow-hidden"><Building2 /><MessageCircle /><FileSignature /><Sparkles /></div>
      <div className="relative z-10 sm:max-w-[65%]">
        <h1 className="text-5xl font-black leading-none sm:text-6xl">TORAFF</h1>
        <p className="mt-4 text-[30px] font-extrabold leading-tight sm:text-4xl">יותר זמן ללקוחות.<br /><span className="text-guest-sun">פחות עבודה מסביב.</span></p>
        <p className="mt-3 max-w-lg text-lg leading-relaxed">הנכסים, הפניות והמשימות שלך במקום אחד.<br />עם ריטה, סוכנת ה-AI לצידך.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild className="h-12 gap-2 bg-guest-sun px-4 text-lg font-bold text-guest-ink hover:bg-guest-sun/90"><Link to="/auth?mode=signup"><UserPlus className="h-5 w-5" />הרשמה חינם</Link></Button>
          <Button asChild variant="outline" className="h-12 gap-2 border-guest-on-stage/50 bg-transparent px-4 text-lg text-guest-on-stage hover:bg-guest-on-stage/10 hover:text-guest-on-stage"><Link to="/auth?mode=login"><LogIn className="h-5 w-5" />התחברות</Link></Button>
          <Button asChild variant="ghost" className="col-span-2 h-11 gap-2 text-base text-guest-on-stage hover:bg-guest-on-stage/10 hover:text-guest-on-stage"><a href="/demo/broker/properties"><Eye className="h-5 w-5" />כניסה למרחב דמו<ArrowUpLeft className="h-4 w-4" /></a></Button>
        </div>
      </div>
      <div className="relative mt-4 flex min-h-36 items-center sm:mt-0 sm:min-h-28">
        <div className="relative z-10 max-w-[62%] pb-5 sm:max-w-[60%]">
          <p className="text-xl font-bold">היי, אני ריטה!</p>
          <Button variant="link" className="h-auto p-0 text-base text-guest-on-stage" onClick={() => window.dispatchEvent(new Event('toraff:visitor-menu-open'))}>בואו נדבר<MessageCircle className="ms-2 h-5 w-5" /></Button>
        </div>
        <img src={ritaPointing} alt="ריטה, סוכנת ה-AI של TORAFF" width={768} height={1376} className="broker-guest-rita pointer-events-none absolute bottom-0 left-0 h-48 w-32 object-contain object-bottom sm:left-0 sm:h-[350px] sm:w-52" />
      </div>
    </div>
    <div className="broker-guest-strip overflow-hidden border-b border-border bg-background py-3" aria-label="תקשורת וניהול במקום אחד">
      <div className="broker-guest-track flex w-max items-center" dir="ltr">{[0, 1].map(dup => <div key={dup} aria-hidden={dup === 1} className="flex shrink-0 items-center gap-8 px-4">{['whatsapp', 'facebook', 'messenger', 'gmail', 'sms'].map(platform => <BrandLogo key={platform} platform={platform} size={26} />)}<span className="text-base font-black text-primary">TORAFF</span></div>)}</div>
    </div>
    <p className="px-5 py-4 text-base leading-relaxed text-muted-foreground">כבר נפתח לך חשבון או התקבל מייל מאיתנו? הכניסה עם מספר הנייד וקוד אימות.</p>
    <div className="grid sm:grid-cols-2">
      {benefits.map(({icon: Icon,title,text}, index) => <div key={title} data-tone={index} className="broker-guest-benefit flex gap-4 px-5 py-5 sm:px-7">
        <Icon className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
        <div><h2 className="text-xl font-bold text-foreground">{title}</h2><p className="mt-1 text-base leading-relaxed text-muted-foreground">{text}</p></div>
      </div>)}
    </div>
  </section>;
}