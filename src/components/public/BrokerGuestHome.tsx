import { useEffect, useRef, useState } from 'react';
import { Building2, ClipboardList, FileSignature, Megaphone, MessageCircle, Sparkles, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router-compat';
import ritaPointing from '@/assets/rita-pointing.webp';
import ritaAvatar from '@/assets/rita-avatar.jpg';
import { BrandLogo } from '@/components/social/BrandLogo';
import { PLATFORMS } from '@/components/landing/LogoTickers';
import { VisitorRitaChat } from './VisitorRitaChat';

type Slide = { icon?: LucideIcon; title: string; accent: string; text: string; rita?: 'pointing' | 'avatar'; oneLine?: boolean };

/** Slide 0 is the main pitch; each following slide matches one feature card below, in the same order and color. */
const intro: Slide = { title: 'פחות ניירת.', accent: 'יותר עסקאות.', text: 'ללא מנוי חודשי וללא התחייבות', rita: 'pointing' };
const benefits: (Slide & { icon: LucideIcon; card: string; cardText: string })[] = [
  { icon: Building2, card: 'כל הנכסים שלך, מסודרים', cardText: 'ייבוא בקליק אחד וניהול נוח של כל תיק הנכסים.', title: 'כל הנכסים.', accent: 'בקליק אחד.', text: 'מייבאים את כל הנכסים בקליק אחד ומנהלים אותם בקלות וביעילות בממשק של טוראף.' },
  { icon: MessageCircle, card: 'ריטה מטפלת בפניות', cardText: 'מענה מיידי, בירור צרכים ומעקב אחר כל ליד.', title: 'אף פנייה', accent: 'לא נופלת.', text: 'ריטה עונה מיד, מבררת מה הלקוח מחפש ומעבירה אליך רק לידים רציניים.', rita: 'avatar', oneLine: true },
  { icon: ClipboardList, card: 'יום עבודה בשליטה', cardText: 'משימות, סיורים ותזכורות שמסודרים בשבילך.', title: 'היום שלך,', accent: 'בשליטה מלאה.', text: 'משימות, סיורים ותזכורות מסודרים מראש, כדי שתתפנה למה שחשוב באמת: לסגור עסקאות.' },
  { icon: Megaphone, card: 'קבוצות פייסבוק על אוטומט', cardText: 'ריטה כותבת, מפרסמת, מגיבה ומחממת לידים.', title: 'הקבוצות', accent: 'עובדות בשבילך.', text: 'ריטה כותבת ומעצבת פוסטים, מפרסמת ומפיצה בקבוצות, עונה לתגובות ומחממת לידים עד שהם מוכנים לשיחה.' },
  { icon: Users, card: 'כרטיס לקוח אחד לכל הערוצים', cardText: 'וואטסאפ, מייל, פייסבוק ושיחות במסך אחד.', title: 'לקוח אחד,', accent: 'כרטיס אחד.', text: 'לכל לקוח יש כרטיס אחד שמרכז את כל השיחות מכל הערוצים, כך שהכול מול העיניים במסך אחד.' },
  { icon: FileSignature, card: 'חתימה דיגיטלית בלי ניירת', cardText: 'שליחת מסמכים לחתימה ומעקב אחר כל שלב.', title: 'חתימה דיגיטלית', accent: 'בתוך דקות.', text: 'שולחים מסמך, הלקוח חותם מהנייד ואתם רואים כל שלב. בלי מנוי, משלמים רק כשמשתמשים.', oneLine: true },
];
const slides: Slide[] = [intro, ...benefits];
// Each half repeats the logos enough to stay wider than the screen, so the loop never shows a gap.
const marquee = [...PLATFORMS, ...PLATFORMS, ...PLATFORMS];

export function BrokerGuestHome() {
  const [active, setActive] = useState(0);
  const [chat, setChat] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLDivElement>(null);
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
    <div ref={banner} data-tone={active - 1} className="broker-guest-intro relative isolate overflow-hidden">
      <div aria-hidden="true" className="broker-guest-art pointer-events-none absolute inset-0 overflow-hidden"><Building2 /><MessageCircle /><FileSignature /><Sparkles /></div>
      <div ref={scroller} className="broker-guest-slides relative z-10 flex snap-x snap-mandatory overflow-x-auto" aria-roledescription="קרוסלה" aria-label="מה TORAFF עושה בשבילך">
        {slides.map((s, i) => <div key={i} role="group" aria-roledescription="שקופית" aria-label={`${i + 1} מתוך ${slides.length}`} className="relative flex min-h-[300px] w-full shrink-0 snap-start flex-col px-5 pb-12 pt-7 sm:min-h-[400px] sm:px-10 sm:pt-10">
          {s.rita === 'avatar' && <img src={ritaAvatar} alt="ריטה" className="absolute left-4 top-4 z-10 h-14 w-14 rounded-full border-2 border-guest-on-stage/70 object-cover sm:left-8 sm:top-8 sm:h-20 sm:w-20" />}
          <div className={`relative z-10 ${s.rita === 'pointing' ? 'max-w-[60%] sm:max-w-[58%]' : s.rita === 'avatar' ? 'pe-16 sm:pe-24' : ''}`}>
            {s.oneLine
              ? <p className="mt-1 whitespace-nowrap text-[clamp(22px,7vw,48px)] font-extrabold leading-tight">{s.title} <span className="text-guest-sun">{s.accent}</span></p>
              : <p className="mt-1 text-[32px] font-extrabold leading-tight sm:text-5xl">{s.title}<br /><span className="text-guest-sun">{s.accent}</span></p>}
            <p className="mt-3 max-w-lg text-lg leading-relaxed">{s.text}</p>
          </div>
          {(i === 0 || i === slides.length - 1) && <div className={`relative z-10 mt-5 flex ${i === 0 ? '' : 'justify-center'}`}>
            <Button asChild className="h-12 gap-2 bg-guest-sun px-5 text-lg font-bold text-guest-ink hover:bg-guest-sun/90"><Link to="/auth?mode=signup"><UserPlus className="h-5 w-5" />הרשמה חינם</Link></Button>
          </div>}
          {s.rita === 'pointing' && <div className="relative z-10 mt-auto pb-2 pt-4">
            <Button variant="link" className="h-auto p-0 text-lg font-bold text-guest-on-stage" onClick={() => setChat(true)}><MessageCircle className="me-2 h-5 w-5" />דברו עם ריטה</Button>
          </div>}
          {s.rita === 'pointing' && <img src={ritaPointing} alt="ריטה, סוכנת ה-AI של TORAFF" width={768} height={1376} className="broker-guest-rita pointer-events-none absolute bottom-0 left-2 -scale-x-100 h-[280px] w-32 object-contain object-bottom sm:left-6 sm:h-[390px] sm:w-56" />}
        </div>)}
      </div>
      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center gap-2" role="tablist" aria-label="בחירת שקופית">
        {slides.map((_, i) => <button key={i} type="button" role="tab" aria-selected={active === i} aria-label={`שקופית ${i + 1}`} onClick={() => goTo(i)} className={`h-2 rounded-full transition-all ${active === i ? 'w-6 bg-guest-sun' : 'w-2 bg-guest-on-stage/40'}`} />)}
      </div>
    </div>
    <div dir="ltr" className="broker-guest-strip overflow-hidden border-b border-border bg-background py-3" aria-label="תקשורת וניהול במקום אחד">
      <div className="broker-guest-track flex w-max" dir="ltr">{[0, 1].map(dup => <div key={dup} aria-hidden={dup === 1} className="flex shrink-0 items-center gap-8 pe-8">{marquee.map((platform, i) => <BrandLogo key={`${platform}-${i}`} platform={platform} size={26} />)}</div>)}</div>
    </div>
    <div className="grid sm:grid-cols-2">
      {benefits.map(({ icon: Icon, card, cardText }, index) => <button type="button" key={card} data-tone={index} data-active={active === index + 1} aria-pressed={active === index + 1} onClick={() => { goTo(index + 1); banner.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="broker-guest-benefit flex gap-4 px-5 py-5 text-right sm:px-7">
        <Icon className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
        <div><h2 className="text-xl font-bold text-foreground">{card}</h2><p className="mt-1 text-base leading-relaxed text-muted-foreground">{cardText}</p></div>
      </button>)}
    </div>
    {chat && <VisitorRitaChat dialogOnly onClose={() => setChat(false)} />}
  </section>;
}
