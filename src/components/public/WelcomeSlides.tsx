import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import ritaPointing from '@/assets/rita-pointing.webp';
import { CoinsCurrency, NetworkHomes } from '@/components/public/welcomeIcons';
import { PlatformTicker } from '@/components/landing/LogoTickers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dismissWelcome, welcomeDismissed } from '@/lib/welcomePreference';

type Accent = 'gold' | 'red' | 'sky';
const Hi = ({ children, tone }: { children: ReactNode; tone: Accent }) => <span className={`welcome-accent-${tone}`}>{children}</span>;

const SLIDES = [
  { icon: NetworkHomes, theme: 1, title: <>מחברים בין <Hi tone="red">מתווכים</Hi>, יזמים ובעלי נכסים</>, text: <>האקוסיסטם הראשון בעולם ה<Hi tone="red">נדל"ן</Hi> שמחבר את כולם לרשת <Hi tone="red">שותפים</Hi> חכמה אחת שעובדת בשבילכם אוטומטית.</> },
  { icon: CoinsCurrency, theme: 2, title: <>כאן כולם <Hi tone="gold">מרוויחים</Hi></>, text: <div className="space-y-4">
    <p><strong>בעלי נכס / מתווכים</strong><br />אתם קובעים מראש את עמלת הסגירה ומחיר הלידים שאתם מוכנים לשלם.</p>
    <p><strong>קונים / שוכרים</strong><br />משלמים עמלת תיווך קבועה של 1% לאחר הקנייה או 10% מגובה השכירות החודשית לאחר חתימת חוזה.</p>
    <p><strong>חברים בתוכנית השותפים</strong><br />משתפים נכסים מהמאגר, יוצרים ומפרסמים קמפיינים ברשתות ומרוויחים עמלות באוטומציה מלאה.</p>
  </div> },
  { icon: null, theme: 3, title: <>היי, אני <span className="text-destructive">ריטה</span>.<br />סוכנת ה-AI האישית שלך</>, text: <>אני מייצגת אותך נאמנה 24/7 בכל הערוצים. מאתרת נכסים, יוצרת ומפרסמת פוסטים, עונה לתגובות ומייצרת לידים חמים בוואטסאפ, בטלפון ובכל הרשתות.<br /><br />במילים פשוטות: אני מייצרת לך הכנסה פסיבית בזמן שאתה ישן 😍</> },
] as const;

const GeminiSparkle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" className="h-full w-full"><path d="M12 2C12.6 7.4 16.6 11.4 22 12C16.6 12.6 12.6 16.6 12 22C11.4 16.6 7.4 12.6 2 12C7.4 11.4 11.4 7.4 12 2Z" /></svg>;

export function hasSeenWelcomeSlides() {
  return welcomeDismissed();
}

export function WelcomeSlides({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const backgroundIcon = useRef<HTMLDivElement>(null);
  const slide = SLIDES[index];
  const Icon = slide.icon;
  const last = index === SLIDES.length - 1;
  const go = (next: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));

  useEffect(() => {
    const html = document.documentElement.style.overflow, body = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = html; document.body.style.overflow = body; };
  }, []);

  useEffect(() => {
    const element = backgroundIcon.current;
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | undefined;
    let stopped = false;
    let current = 'translate3d(0%, 0%, 0) rotate(0deg) scale(.94)';
    const drift = () => {
      if (stopped || reducedMotion.matches) return;
      const next = `translate3d(${Math.random() * 8 - 4}%, ${Math.random() * 10 - 5}%, 0) rotate(${Math.random() * 16 - 8}deg) scale(${.9 + Math.random() * .08})`;
      animation = element.animate([{ transform: current }, { transform: next }], {
        duration: 5000 + Math.random() * 4000,
        easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards',
      });
      current = next;
      animation.onfinish = drift;
    };
    const motionChanged = () => {
      animation?.cancel();
      current = 'translate3d(0%, 0%, 0) rotate(0deg) scale(.94)';
      drift();
    };
    drift();
    reducedMotion.addEventListener('change', motionChanged);
    return () => { stopped = true; animation?.cancel(); reducedMotion.removeEventListener('change', motionChanged); };
  }, []);

  const finish = () => { setLeaving(true); window.setTimeout(onDone, 250); };

  return (
    <section
      dir="rtl"
      aria-roledescription="carousel"
      aria-label="היכרות עם TORAFF"
      data-theme={slide.theme}
      className={cn('welcome-slide relative mx-3 mt-2 flex h-[calc(100dvh-4.75rem)] select-none flex-col overflow-hidden rounded-3xl transition-opacity duration-300 motion-reduce:transition-none', leaving && 'opacity-0')}
      onTouchStart={e => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={e => { const s = touch.current, t = e.changedTouches[0]; touch.current = null; if (!s || !t) return; const dx = t.clientX - s.x; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(t.clientY - s.y)) go(index + (dx > 0 ? 1 : -1)); }}
    >
      <div ref={backgroundIcon} aria-hidden="true" className="welcome-icon pointer-events-none absolute inset-0 flex items-center justify-center">{Icon ? <Icon className="h-full w-full" strokeWidth={4} /> : <span className="welcome-sparkle block h-full w-full"><GeminiSparkle /></span>}</div>
      <Button type="button" variant="ghost" size="icon" aria-label="סגירת ההיכרות" onClick={finish} className="welcome-control absolute right-2 top-2 z-20 h-8 w-8"><X className="h-5 w-5" /></Button>
      <div key={index} className="welcome-content relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-6 pb-4 pt-12 text-right sm:px-14 sm:pt-16" aria-live="polite">
        <div className="welcome-text min-h-0 overflow-y-auto overscroll-contain">
          <h2 className="welcome-title welcome-enter text-[38px] font-black leading-[1.08] sm:text-[74px]">{slide.title}</h2>
          <div className="welcome-copy welcome-enter mt-5 max-w-2xl text-[22px] font-normal leading-[1.35] [animation-delay:80ms] sm:text-[26px]">{slide.text}</div>
        </div>
        {last && <img src={ritaPointing} alt="ריטה" width={768} height={1376} decoding="async" className="welcome-rita w-auto object-contain" />}
        {last && <div aria-hidden="true" className="welcome-divider" />}
        {last && <div className="welcome-marquee"><PlatformTicker /></div>}
        {last && <Button type="button" onClick={finish} className="welcome-cta welcome-enter h-12 min-h-0 whitespace-nowrap rounded-xl px-7 py-2 text-[20px] font-extrabold leading-tight shadow-lg ring-2 ring-background/60 [animation-delay:150ms]">יאללה, נכנסים ללוח!</Button>}
      </div>
      <div className="welcome-footer relative z-10 flex shrink-0 flex-col items-center gap-2 pb-4">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="הקודם" onClick={() => go(index - 1)} className={cn('welcome-arrow h-10 w-10 bg-transparent hover:bg-transparent', index === 0 && 'invisible')}><ChevronRight className="h-8 w-8" /></Button>
          {SLIDES.map((_, i) => <Button key={i} type="button" variant="ghost" size="icon" aria-label={`שקופית ${i + 1}`} aria-current={i === index} onClick={() => go(i)} className="h-8 w-8 hover:bg-transparent"><span className={cn('welcome-dot h-2.5 rounded-full transition-all duration-300', i === index ? 'w-8' : 'w-2.5 opacity-45')} /></Button>)}
          <Button type="button" variant="ghost" size="icon" aria-label="הבא" onClick={() => go(index + 1)} className={cn('welcome-arrow h-10 w-10 bg-transparent hover:bg-transparent', last && 'invisible')}><ChevronLeft className="h-8 w-8" /></Button>
        </div>
        <Button variant="link" className="welcome-dismiss h-auto p-0 text-base" onClick={() => { dismissWelcome(); finish(); }}>אל תציגו לי יותר</Button>
      </div>
    </section>
  );
}