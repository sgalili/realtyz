import { useEffect, useState } from 'react';

const HEADLINES_FULL = [
  'הפלטפורמה היחידה שתצטרכו לקמפיין שלכם',
  'בלי צורך בספקים חיצוניים: ווטסאפ, SMS ואימייל - הכל בפנים',
  'ניהול שטח, CRM ואסטרטגיה במקום אחד - בלי פשרות',
  'עליונות טכנולוגית שמשאירה את המתחרים מאחור',
  'מערכת ה-AI היחידה בישראל שמנהלת את הבוחר מקצה לקצה',
];

const HEADLINES_MOBILE = [
  'הפלטפורמה היחידה שתצטרכו',
  'ווטסאפ, SMS ואימייל - הכל בפנים',
  'CRM ואסטרטגיה במקום אחד',
  'עליונות טכנולוגית על המתחרים',
  'AI שמנהל בוחר מקצה לקצה',
];

const VISIBLE_MS = 6000;   // each message stays fully visible for 6s
const FADE_MS = 500;       // fade-out / fade-in duration
const GAP_MS = 500;        // blank gap between fade-out end and next fade-in

export function RotatingHeadline({ variant = 'onDark' }: { variant?: 'onDark' | 'onLight' } = {}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  const headlines = isMobile ? HEADLINES_MOBILE : HEADLINES_FULL;

  useEffect(() => {
    if (headlines.length <= 1) return;
    const timers: number[] = [];
    // Cycle: visible 6s -> fade out 0.5s -> blank 0.5s -> swap + fade in 0.5s -> repeat
    const startCycle = () => {
      timers.push(window.setTimeout(() => {
        setVisible(false); // fade out current line
        timers.push(window.setTimeout(() => {
          // fade-out fully complete + gap elapsed, swap then fade in
          setIndex((current) => (current + 1) % headlines.length);
          setVisible(true);
          timers.push(window.setTimeout(startCycle, FADE_MS));
        }, FADE_MS + GAP_MS));
      }, VISIBLE_MS));
    };
    startCycle();
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [headlines.length]);

  useEffect(() => {
    if (index >= headlines.length) setIndex(0);
  }, [headlines.length, index]);

  const onLight = variant === 'onLight';

  const gradientStyle = onLight
    ? {
        color: 'hsl(var(--brand-deep))',
        backgroundImage:
          'linear-gradient(90deg, hsl(var(--brand-deep)) 0%, hsl(var(--brand-blue)) 45%, hsl(var(--gold)) 100%)',
        WebkitBackgroundClip: 'text' as const,
        backgroundClip: 'text' as const,
        WebkitTextFillColor: 'transparent' as const,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
      }
    : {
        backgroundImage:
          'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 88%) 50%, hsl(var(--brand-blue)) 100%)',
        WebkitBackgroundClip: 'text' as const,
        backgroundClip: 'text' as const,
        color: 'transparent',
        WebkitTextFillColor: 'transparent' as const,
        textShadow: '0 0 18px hsl(var(--brand-blue) / 0.45)',
        filter: 'drop-shadow(0 0 6px hsl(var(--brand-blue) / 0.25))',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
      };

  return (
    <div
      className="flex relative h-5 flex-1 min-w-0 items-center justify-start overflow-hidden"
      aria-live="polite"
      dir="rtl"
    >
      {headlines.map((line, i) => {
        const isActive = i === index && visible;
        return (
          <span
            key={line}
            className={`absolute inset-0 flex items-center truncate text-[13px] lg:text-sm font-black tracking-tight transition-opacity ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ ...gradientStyle, transitionDuration: `${FADE_MS}ms` }}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
}
