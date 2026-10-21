import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Network, Coins, Share2, Sparkles, Rocket, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dismissWelcome, welcomeDismissed } from '@/lib/welcomePreference';

type Accent = 'gold' | 'red' | 'sky';
const Hi = ({ children, tone }: { children: ReactNode; tone: Accent }) => <span className={`welcome-accent-${tone}`}>{children}</span>;

const SLIDES = [
  { icon: Network, theme: 1, title: <>לוח שותפים <Hi tone="gold">מטורף</Hi></>, text: <>כל הנכסים, כל ה<Hi tone="sky">שותפים</Hi> וכל ההזדמנויות במקום אחד.</> },
  { icon: Coins, theme: 2, title: <>המוכר קובע את ה<Hi tone="gold">עמלות</Hi></>, text: <>עמלות שקופות מראש. לקונים ולשוכרים מחיר קבוע וברור.</> },
  { icon: Share2, theme: 3, title: <>כאן כולם <Hi tone="red">שותפים</Hi></>, text: <>פרטיים, מתווכים ויזמים משווקים נכסים ומרוויחים <Hi tone="gold">עמלות</Hi>.</> },
  { icon: Sparkles, theme: 1, title: <>מעלים פעם אחת. <Hi tone="gold">AI</Hi> מפיץ</>, text: <>הנכס מופץ <Hi tone="sky">אוטומטית</Hi> לעשרות קבוצות, עם מענה ולידים.</> },
  { icon: Rocket, theme: 2, title: <>רווחים <Hi tone="gold">אוטומטית</Hi></>, text: <>הפצה, לידים ועמלות עובדים בשבילכם. מתחילים עכשיו.</> },
] as const;

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
      <div ref={backgroundIcon} aria-hidden="true" className="welcome-icon pointer-events-none absolute inset-0 flex items-center justify-center"><Icon className="h-full w-full" strokeWidth={.85} /></div>
      <Button type="button" variant="ghost" size="sm" onClick={finish} className="welcome-control absolute left-3 top-3 z-20 gap-1">דלג <X className="h-4 w-4" /></Button>
      <div key={index} className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-start px-14 pb-6 pt-24 text-right sm:pt-20" aria-live="polite">
        <h2 className="welcome-title welcome-enter text-5xl font-black leading-[1.02] sm:text-7xl">{slide.title}</h2>
        <p className="welcome-copy welcome-enter mt-5 max-w-lg text-2xl font-normal leading-relaxed sm:text-[28px] [animation-delay:80ms]">{slide.text}</p>
        {last && <Button type="button" onClick={finish} className="welcome-cta welcome-enter mt-8 h-16 w-full max-w-sm rounded-2xl text-xl font-black [animation-delay:150ms]">יאללה, נכנסים ללוח!</Button>}
      </div>
      {index > 0 && <Button type="button" variant="ghost" size="icon" aria-label="הקודם" onClick={() => go(index - 1)} className="welcome-control absolute right-2 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full"><ChevronRight className="h-8 w-8" /></Button>}
      {!last && <Button type="button" variant="ghost" size="icon" aria-label="הבא" onClick={() => go(index + 1)} className="welcome-control absolute left-2 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full"><ChevronLeft className="h-8 w-8" /></Button>}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-5">
        <div className="flex gap-1">{SLIDES.map((_, i) => <Button key={i} type="button" variant="ghost" size="icon" aria-label={`שקופית ${i + 1}`} aria-current={i === index} onClick={() => go(i)} className="h-8 w-8 hover:bg-transparent"><span className={cn('welcome-dot h-2.5 rounded-full transition-all duration-300', i === index ? 'w-8' : 'w-2.5 opacity-45')} /></Button>)}</div>
        <Button variant="link" className="welcome-dismiss h-auto p-0 text-base" onClick={() => { dismissWelcome(); finish(); }}>אל תציגו לי יותר</Button>
      </div>
    </section>
  );
}