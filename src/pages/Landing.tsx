import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Bot, Building2, MessageCircle, PhoneCall, Sparkles, Zap, ShieldCheck,
  CalendarCheck2, Infinity as InfinityIcon, ArrowLeft, Check,
} from 'lucide-react';
import {
  FREE_CONTACTS, FREE_PROPERTIES, PRICE_PER_CONTACT, quoteForContacts,
} from '@/lib/pricing';
import { fmtILS } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────
   Realtyz — דף נחיתה עתידני (RTL), אנימציות 60fps, המרה מקסימלית.
   Dark navy + gold. כל הצבעים דרך טוקנים של .realtyz-landing.
   ──────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Bot,
    title: 'סוכן AI שעובד 24/7',
    body: 'מסנן, מדרג ומחמם כל מתעניין חדש בשנייה שהוא נכנס - גם ב-3 לפנות בוקר.',
  },
  {
    icon: PhoneCall,
    title: 'סיכומי שיחות אוטומטיים',
    body: 'מקליטים או מקלידים - ה-AI מסכם, מתייג ופותח משימת המשך בלוח שלכם.',
  },
  {
    icon: Building2,
    title: 'התאמת נכסים חכמה',
    body: 'מנוע התאמה שמצליב העדפות מול מלאי חי מיד2 והומלי ומציע את הנכס הנכון.',
  },
  {
    icon: Zap,
    title: 'ווטסאפ ו-SMS בלי השהייה',
    body: 'טריגרים מיידיים ברגע שנוצר מתעניין - מענה ראשון תוך שניות, לא שעות.',
  },
  {
    icon: CalendarCheck2,
    title: 'תיאום סיורים מסונכרן',
    body: 'סנכרון מלא ליומן גוגל עם חלונות פנויים אמיתיים, בלי כפל פגישות.',
  },
  {
    icon: ShieldCheck,
    title: 'שליטה מלאה של המתווך',
    output: true,
    body: 'תור אישורים, כפתור עצירה מיידי ותיעוד של כל פעולה שה-AI ביצע.',
  },
];

const INCLUDED = [
  'CRM מתעניינים מלא',
  'תיבת דואר אומני-צ\'אנל',
  'ניהול נכסים ומלאי חי',
  'יצירת פוסטים ופרסום לפייסבוק ואינסטגרם',
  'אוטומציות וסיכומי שיחה',
  'משתמשים וצוות ללא הגבלה',
];

function useCounter(target: number, ms = 700) {
  const [value, setValue] = useState(target);
  const raf = useRef<number>();
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(startVal + (target - startVal) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, ms]);
  return value;
}

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'will-change-transform transition-all duration-700 ease-out',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const [contacts, setContacts] = useState(250);
  const quote = useMemo(() => quoteForContacts(contacts), [contacts]);
  const animatedPrice = useCounter(quote.monthlyPrice);
  const animatedContacts = useCounter(quote.contacts, 350);

  return (
    <div dir="rtl" className="realtyz-landing min-h-screen bg-background text-foreground antialiased">
      {/* ───────── Nav ───────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-extrabold tracking-tight">
            Realtyz<span className="text-primary">.</span>
          </span>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">יכולות</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">תמחור</a>
            <a href="#free" className="transition-colors hover:text-foreground">מסלול חינם</a>
          </nav>
          <Link to="/auth">
            <Button size="sm" className="font-bold">התחברות</Button>
          </Link>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden">
        {/* 60fps GPU-only animated aurora background */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="landing-aurora landing-aurora-a" />
          <div className="landing-aurora landing-aurora-b" />
          <div className="landing-grid absolute inset-0" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[13px] font-bold text-primary">
              <Sparkles className="h-4 w-4" />
              ה-CRM הראשון בישראל שמנוהל על ידי סוכני AI
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mx-auto mt-7 max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
              המערכת שמנהלת את המתעניינים שלכם
              <span className="landing-gradient-text block"> 24 שעות ביממה, בלי הפסקה</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              סינון מתעניינים, סיכומי שיחות, התאמת נכסים ומענה מיידי בווטסאפ - הכל אוטומטי,
              הכל בעברית, הכל תחת השליטה שלכם.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="group h-14 w-full px-8 text-base font-extrabold shadow-2xl shadow-primary/25 sm:w-auto">
                  התחל בחינם עכשיו - ללא הגבלת זמן וללא כרטיס אשראי
                  <ArrowLeft className="ms-2 h-5 w-5 transition-transform group-hover:-translate-x-1" />
                </Button>
              </Link>
              <a href="#pricing" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="h-14 w-full px-7 text-base font-bold sm:w-auto">
                  חשב את העלות שלי
                </Button>
              </a>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{FREE_CONTACTS} אנשי קשר חינם לתמיד</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{FREE_PROPERTIES} נכסים</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />כל יכולות ה-AI פתוחות</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              מה שהמתווכים הטובים בישראל מקבלים ביום הראשון
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <article className="landing-card group h-full rounded-2xl border border-border/70 bg-card p-6 transition-transform duration-300 will-change-transform hover:-translate-y-1.5">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
                    <f.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Pricing calculator ───────── */}
      <section id="pricing" className="relative overflow-hidden border-t border-border/60 py-20">
        <div aria-hidden className="landing-aurora landing-aurora-c pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto w-full max-w-4xl px-4">
          <Reveal>
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                תמחור אחד. שקוף. לפי אנשי קשר בלבד.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                כל הפיצ'רים של ה-AI ללא הגבלה - משלמים רק לפי כמות אנשי הקשר.
                בלי אותיות קטנות, בלי עלויות נסתרות. IVR ושיחות AI קוליות מתומחרים לפי צריכה בפועל.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="landing-card mt-10 rounded-3xl border border-border/70 bg-card p-6 sm:p-9">
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold tabular-nums text-primary sm:text-6xl">
                    <bdi dir="ltr">{fmtILS(animatedPrice)}</bdi>
                  </span>
                  <span className="pb-2 text-sm font-semibold text-muted-foreground">/ חודש</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {quote.isFree
                    ? `עד ${FREE_CONTACTS} אנשי קשר - חינם לתמיד`
                    : <>{fmtILS(PRICE_PER_CONTACT, { fractionDigits: 2 })} לאיש קשר · {FREE_CONTACTS} הראשונים חינם</>}
                </p>
                {quote.discountRate > 0 && (
                  <span className="mt-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                    הנחת כמות {Math.round(quote.discountRate * 100)}% מוחלת אוטומטית
                  </span>
                )}
              </div>

              <div className="mt-9">
                <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                  <span className="text-muted-foreground">כמה אנשי קשר יש לכם?</span>
                  <span className="tabular-nums">{animatedContacts.toLocaleString('he-IL')}</span>
                </div>
                <Slider
                  dir="rtl"
                  value={[contacts]}
                  min={10}
                  max={10_000}
                  step={10}
                  onValueChange={(v) => setContacts(v[0])}
                  aria-label="כמות אנשי קשר"
                />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>10</span><span>10,000</span>
                </div>
              </div>

              <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[15px]">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 text-[15px] font-semibold">
                  <InfinityIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span>שימוש פנימי ללא הגבלה</span>
                </li>
              </ul>

              <Link to="/auth" className="mt-8 block">
                <Button size="lg" className="h-14 w-full text-base font-extrabold">
                  התחל חינם ברגע - בלי אשראי
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Freemium ───────── */}
      <section id="free" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-4xl px-4 text-center">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">מסלול חינם נצחי</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {FREE_CONTACTS} אנשי קשר, {FREE_PROPERTIES} נכסים, כל יכולות ה-AI פתוחות.
              ללא הגבלת זמן, ללא כרטיס אשראי, בלי שיחת מכירה.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-9 grid max-w-2xl gap-4 sm:grid-cols-3">
              {[
                { icon: MessageCircle, label: `${FREE_CONTACTS} אנשי קשר` },
                { icon: Building2, label: `${FREE_PROPERTIES} נכסים` },
                { icon: Bot, label: 'AI ללא הגבלה' },
              ].map((s) => (
                <div key={s.label} className="landing-card rounded-2xl border border-border/70 bg-card px-4 py-6">
                  <s.icon className="mx-auto h-7 w-7 text-primary" />
                  <p className="mt-3 text-base font-bold">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <Link to="/auth" className="mt-10 inline-block">
              <Button size="lg" className="h-14 px-10 text-base font-extrabold shadow-2xl shadow-primary/25">
                פתיחת חשבון ומעבר מיידי למערכת
              </Button>
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-sm text-muted-foreground">
        <p>Realtyz - מערכת ניהול נדל"ן מונעת AI · כל הזכויות שמורות</p>
      </footer>
    </div>
  );
}
