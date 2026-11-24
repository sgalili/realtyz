import { useEffect, useRef, useState } from 'react';
import { Building2, ClipboardList, Eye, FileSignature, LogIn, MessageCircle, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router-compat';
import ritaPointing from '@/assets/rita-pointing.webp';
import ritaAvatar from '@/assets/rita-avatar.jpg';
import { BrandLogo } from '@/components/social/BrandLogo';
import { PLATFORMS } from '@/components/landing/LogoTickers';
import { VisitorRitaChat } from './VisitorRitaChat';

type Slide = { icon?: LucideIcon; kicker?: string; title: string; accent: string; text: string; rita?: 'pointing' | 'avatar' };

/** Slide 0 is the main pitch; each following slide matches one feature card below, in the same order. */
const intro: Slide = { title: 'פחות ניירת.', accent: 'יותר עסקאות.', text: 'נכסים, פניות ומשימות במקום אחד, עם ריטה שעובדת בשבילך מסביב לשעון.', rita: 'pointing' };
const benefits: (Slide & { icon: LucideIcon; card: string; cardText: string })[] = [
  { icon: Building2, card: 'הנכסים שלך, מסודרים', cardText: 'ניהול נכסים וייבוא מיד2, בלי להזין הכול מחדש.', kicker: 'הנכסים שלך', title: 'כל הנכסים.', accent: 'בלחיצה אחת.', text: 'מייבאים מיד2 ומקבלים תיק נכסים מסודר, מוכן לעבודה.' },
  { icon: MessageCircle, card: 'ריטה מטפלת בפניות', cardText: 'שיחות, בירור צרכים ומעקב אחר לידים במקום אחד.', kicker: 'ריטה', title: 'אף פנייה', accent: 'לא נופלת.', text: 'ריטה עונה, מבררת צרכים ומעבירה אליך רק לידים רציניים.', rita: 'avatar' },
  { icon: ClipboardList, card: 'יום עבודה בשליטה', cardText: 'משימות, סיורים וקמפיינים בפייסבוק ובוואטסאפ.', kicker: 'יום העבודה', title: 'היום שלך,', accent: 'בשליטה מלאה.', text: 'משימות, סיורים וקמפיינים בפייסבוק ובוואטסאפ, בלוח אחד.' },
  { icon: FileSignature, card: 'חתימות בלי ניירת', cardText: 'שליחת מסמכים לחתימה ומעקב אחר הסטטוס.', kicker: 'חתימות', title: 'חתימה', accent: 'בתוך דקות.', text: 'שולחים מסמך, הלקוח חותם מהנייד, ואתם רואים כל שלב.' },
];
const slides: Slide[] = [intro, ...benefits];
// Repeat the logos inside each half so one half is always wider than the screen: no blank gap at the loop seam.
const marquee = [...PLATFORMS, ...PLATFORMS];

export function BrokerGuestHome() {
  const [active, setActive] = useState(0);
  const [chat, setChat] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const goTo = (index: number) => {
    const el = scroller.current; const slide = el?.children[index] as HTMLElement | undefined;
    if (el && slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setActive(index);
  };
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const onScroll = () => { const i = Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)); setActive(Math.min(slides.length - 1, Math.max(0, i))); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return <section dir="rtl" data-no-hero-wave className="broker-guest-welcome mx-auto w-full max-w-5xl pb-5">
    <div className="broker-guest-intro relative isolate overflow-hidden">
      <div aria-hidden="true" className="broker-guest-art pointer-events-none absolute inset-0 overflow-hidden"><Building2 /><MessageCircle /><FileSignature /><Sparkles /></div>
      <div ref={scroller} className="broker-guest-slides relative z-10 flex snap-x snap-mandatory overflow-x-auto" aria-roledescription="קרוסלה" aria-label="מה TORAFF עושה בשבילך">
        {slides.map((s, i) => <div key={i} role="group" aria-roledescription="שקופית" aria-label={`${i + 1} מתוך ${slides.length}`} className="relative flex w-full shrink-0 snap-start flex-col px-5 pb-6 pt-7 sm:px-10 sm:pt-10">
          <div className={`relative z-10 ${s.rita === 'pointing' ? 'max-w-[64%] sm:max-w-[60%]' : 'sm:max-w-[65%]'}`}>
            {s.kicker && <p className="text-base font-bold text-guest-sun">{s.kicker}</p>}
            <p className="mt-1 text-[32px] font-extrabold leading-tight sm:text-5xl">{s.title}<br /><span className="text-guest-sun">{s.accent}</span></p>
            <p className="mt-3 max-w-lg text-lg leading-relaxed">{s.text}</p>
          </div>
          <div className="relative z-10 mt-5 flex flex-wrap items-center gap-2">
            <Button asChild className="h-12 gap-2 bg-guest-sun px-5 text-lg font-bold text-guest-ink hover:bg-guest-sun/90"><Link to="/auth?mode=signup"><UserPlus className="h-5 w-5" />הרשמה חינם</Link></Button>
            {i === 0 ? <Button asChild variant="outline" className="h-12 gap-2 border-guest-on-stage/50 bg-transparent px-4 text-lg text-guest-on-stage hover:bg-guest-on-stage/10 hover:text-guest-on-stage"><Link to="/auth?mode=login"><LogIn className="h-5 w-5" />התחברות</Link></Button>
              : <Button asChild variant="ghost" className="h-12 gap-2 px-3 text-base text-guest-on-stage hover:bg-guest-on-stage/10 hover:text-guest-on-stage"><a href="/demo/broker/properties"><Eye className="h-5 w-5" />מרחב הדגמה</a></Button>}
          </div>
          {s.rita && <div className="relative z-10 mt-4 flex items-center gap-3">
            {s.rita === 'avatar' && <img src={ritaAvatar} alt="" className="h-12 w-12 rounded-full object-cover" />}
            <Button variant="link" className="h-auto p-0 text-lg font-bold text-guest-on-stage" onClick={() => setChat(true)}><MessageCircle className="me-2 h-5 w-5" />דברו עם ריטה</Button>
          </div>}
          {s.rita === 'pointing' && <img src={ritaPointing} alt="ריטה, סוכנת ה-AI של TORAFF" width={768} height={1376} className="broker-guest-rita pointer-events-none absolute bottom-0 left-2 h-56 w-32 object-contain object-bottom sm:left-6 sm:h-[340px] sm:w-52" />}
        </div>)}
      </div>
      <div className="relative z-10 flex justify-center gap-2 pb-3" role="tablist" aria-label="בחירת שקופית">
        {slides.map((_, i) => <button key={i} type="button" role="tab" aria-selected={active === i} aria-label={`שקופית ${i + 1}`} onClick={() => goTo(i)} className={`h-2 rounded-full transition-all ${active === i ? 'w-6 bg-guest-sun' : 'w-2 bg-guest-on-stage/40'}`} />)}
      </div>
    </div>
    <div className="broker-guest-strip overflow-hidden border-b border-border bg-background py-3" aria-label="תקשורת וניהול במקום אחד">
      <div className="broker-guest-track flex w-max" dir="ltr">{[0, 1].map(dup => <div key={dup} aria-hidden={dup === 1} className="flex shrink-0 items-center gap-8 pe-8">{marquee.map((platform, i) => <BrandLogo key={`${platform}-${i}`} platform={platform} size={26} />)}</div>)}</div>
    </div>
    <div className="grid sm:grid-cols-2">
      {benefits.map(({ icon: Icon, card, cardText }, index) => <button type="button" key={card} data-tone={index} data-active={active === index + 1} aria-pressed={active === index + 1} onClick={() => goTo(index + 1)} className="broker-guest-benefit flex gap-4 px-5 py-5 text-right sm:px-7">
        <Icon className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
        <div><h2 className="text-xl font-bold text-foreground">{card}</h2><p className="mt-1 text-base leading-relaxed text-muted-foreground">{cardText}</p></div>
      </button>)}
    </div>
    {chat && <VisitorRitaChat dialogOnly onClose={() => setChat(false)} />}
  </section>;
}
