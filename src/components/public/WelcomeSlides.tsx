import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BrandLogo } from '@/components/social/BrandLogo';
import ritaPointing from '@/assets/rita-pointing.webp';
import { CoinsCurrency, NetworkHomes, ShareShekels } from '@/components/public/welcomeIcons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dismissWelcome, welcomeDismissed } from '@/lib/welcomePreference';

type Accent = 'gold' | 'red' | 'sky';
const Hi = ({ children, tone }: { children: ReactNode; tone: Accent }) => <span className={`welcome-accent-${tone}`}>{children}</span>;

const SLIDES = [
  { icon: NetworkHomes, theme: 1, title: <>מחברים בין <Hi tone="red">מתווכים</Hi>, יזמים ובעלי נכסים</>, text: <>האקוסיסטם הראשון בעולם ה<Hi tone="red">נדל"ן</Hi> שמחבר את כולם לרשת <Hi tone="red">שותפים</Hi> חכמה אחת שעובדת בשבילכם אוטומטית.</> },
  { icon: CoinsCurrency, theme: 2, title: <>כאן כולם <Hi tone="gold">מרוויחים</Hi></>, text: <div className="space-y-4">
    <p><strong className="welcome-strong">משתפים נכסים. יוצרים קמפיינים אוטומטיים</strong> ומרוויחים עמלות גבוהות באוטומציה מלאה.</p>
    <p><strong className="welcome-strong">מוכרים / משכירים / מתווכים?</strong><br />קובעים מראש את עמלת הסגירה ומחיר הלידים לוהטים בשקלים 🔥</p>
    <p><strong className="welcome-strong">קונים / שוכרים?</strong><br />עמלת תיווך קבועה של 1% על מכירה ו-10% על שכירות חודשית.</p>
  </div> },
  { icon: null, theme: 3, title: <>ריטה, סוכנת ה-AI האישית שלכם</>, text: <>מייצגת אתכם נאמנה 24/7 בכל הערוצים. מאתרת נכסים, יוצרת ומפרסמת פוסטים, עונה לתגובות ומייצרת לידים חמים בוואטסאפ, בטלפון ובכל הרשתות. במילים פשוטות: ריטה מייצרת לכם הכנסה פאסיבית בזמן שאתם ישנים 😍</> },
] as const;

const FLOATING = [
  { platform: 'whatsapp', pos: 'right-[8%] top-[14%]' }, { platform: 'facebook', pos: 'left-[10%] top-[10%]' },
  { platform: 'instagram', pos: 'right-[22%] bottom-[30%]' }, { platform: 'youtube', pos: 'left-[38%] top-[6%]' },
  { platform: 'calendar', pos: 'right-[4%] bottom-[48%]' }, { platform: 'gmail', pos: 'left-[44%] bottom-[24%]' },
];

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
      className={cn('welcome-slide relative mx-3 mt-2 flex h-[calc(100dvh-4.75rem)] touch-none select-none flex-col overflow-hidden rounded-3xl transition-opacity duration-300 motion-reduce:transition-none', leaving && 'opacity-0')}
      onTouchStart={e => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={e => { const s = touch.current, t = e.changedTouches[0]; touch.current = null; if (!s || !t) return; const dx = t.clientX - s.x; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(t.clientY - s.y)) go(index + (dx > 0 ? 1 : -1)); }}
    >
      <div ref={backgroundIcon} aria-hidden="true" className="welcome-icon pointer-events-none absolute inset-0 flex items-center justify-center">{Icon && <Icon className="h-full w-full" strokeWidth={2} />}</div>
      {!Icon && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {FLOATING.map((f, i) => <span key={f.platform} className={cn('welcome-float absolute flex h-12 w-12 items-center justify-center opacity-50', f.pos)} style={{ animationDelay: `${i * -0.9}s` }}>{f.platform === 'calendar' ? <CalendarDays className="h-7 w-7 text-deal-blue" strokeWidth={2} /> : <BrandLogo platform={f.platform} className="h-7 w-7" />}</span>)}
        <img src={ritaPointing} alt="" decoding="async" className="welcome-enter absolute bottom-0 left-0 h-[58%] w-auto object-contain sm:h-[70%]" />
      </div>}
      <Button type="button" variant="ghost" size="sm" onClick={finish} className="welcome-control absolute right-3 top-3 z-20 gap-1">דלג <X className="h-4 w-4" /></Button>
      <div key={index} className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-start px-6 pb-4 pt-14 text-right sm:px-14 sm:pt-16" aria-live="polite">
        <h2 className="welcome-title welcome-enter text-4xl font-black leading-[1.02] sm:text-7xl">{slide.title}</h2>
        <div className={cn("welcome-copy welcome-enter mt-5 max-w-2xl font-normal leading-relaxed [animation-delay:80ms]", "text-xl sm:text-2xl", last && "max-w-[70%] sm:max-w-lg")}>{slide.text}</div>
        {last && <Button type="button" onClick={finish} className="welcome-cta welcome-enter mt-8 h-16 w-full max-w-sm rounded-2xl text-xl font-black [animation-delay:150ms]">יאללה, נכנסים ללוח! 🚀</Button>}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 pb-5">
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