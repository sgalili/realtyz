import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Infinity as InfinityIcon, ArrowLeft, Check,
} from 'lucide-react';
import {
  FREE_CONTACTS, FREE_PROPERTIES, PRICING_TIERS, quoteForContacts,
} from '@/lib/pricing';
import { fmtILS } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { PlatformTicker, StackTicker } from '@/components/landing/LogoTickers';
import realtyzLogo from '@/assets/realtyz-logo.png';
import imgPublishing from '@/assets/landing/card-publishing.jpg';
import imgOmnichannel from '@/assets/landing/card-omnichannel.jpg';
import imgVoice from '@/assets/landing/card-voice.jpg';
import imgCalendar from '@/assets/landing/card-calendar.jpg';
import imgAi from '@/assets/landing/card-ai.jpg';
import imgAnalytics from '@/assets/landing/card-analytics.jpg';


/* ────────────────────────────────────────────────────────────────
   Realtyz — דף נחיתה (RTL). פלטת הצבעים של האפליקציה בלבד:
   נייבי #0B2545, זהב #FFC800, לבן וקנבס אפור רך.
   ללא תגיות/פילים, ללא רקעים לאייקונים - כרטיסים עם תמונת רקע.
   ──────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    image: imgPublishing,
    title: 'יצירת פוסטים ופרסום אוטומטי',
    body: 'ה-AI כותב את הפוסט לנכס, מתזמן בלחיצה אחת ומפרסם ישירות לקבוצות פייסבוק ולאינסטגרם.',
  },
  {
    image: imgOmnichannel,
    title: 'שיחות מכל האפליקציות והרשתות',
    body: 'ווטסאפ, SMS, אימייל ורשתות חברתיות בתיבה אחת מסונכרנת - כל השיחה של הלקוח במקום אחד.',
  },

  {
    image: imgVoice,
    title: 'עוזר AI בווטסאפ - גם בהודעות קוליות',
    body: 'מנהלים את כל העסק מהווטסאפ: שולחים הקלטה קולית או טקסט, מבקשים סטטיסטיקות, מפעילים מבצע ופותחים משימות בזמן אמת.',
  },
  {
    image: imgCalendar,
    title: 'סנכרון גוגל דו-כיווני',
    body: 'Gmail ויומן גוגל מסונכרנים בזמן אמת - חלונות פנויים אמיתיים, בלי כפל פגישות ובלי מיילים שנעלמים.',
  },
  {
    image: imgAi,
    title: 'אימון AI פשוט ומיידי',
    body: 'מזינים את הידע, הטון והכללים של המשרד - וה-"מוח" של הסוכן מתעדכן מיד, בלי מפתחים ובלי הגדרות מסובכות.',
  },
  {
    image: imgVoice,
    title: 'טייס אוטומטי 24/7',
    body: 'ברכות אוטומטיות, תזכורות ומעקבים - מסנן, מדרג ומחמם כל מתעניין חדש, גם ב-3 לפנות בוקר.',
  },
  {
    image: imgPublishing,
    title: 'התאמת נכסים חכמה',
    body: 'מנוע התאמה שמצליב העדפות מול מלאי חי מיד2 והומלי ומציע את הנכס הנכון לכל לקוח.',
  },
  {
    image: imgAnalytics,
    title: 'סיכומי שיחות ותובנות',
    body: 'כל שיחה מסוכמת, מתויגת ומייצרת משימת המשך - עם תמונת מצב עסקית מלאה בכל רגע.',
  },
  {
    image: imgOmnichannel,
    title: 'שליטה מלאה של המתווך',
    body: 'תור אישורים, כפתור עצירה מיידי ותיעוד של כל פעולה שה-AI ביצע. אתם תמיד מחליטים.',
  },
];


const WHATSAPP_POWERS = [
  'שליחת הודעת פתיחה אוטומטית לכל מתעניין חדש בשניות',
  'תזכורות ומעקבים אוטומטיים בלי לזכור כלום',
  'שיחה עם ה-AI בהקלטה קולית או בטקסט - ישר מהווטסאפ',
  'בקשת סטטיסטיקות ודוחות מיידיים ("מה קרה השבוע?")',
  'הפעלת מבצע או קמפיין נכסים בהודעה אחת',
  'פתיחת משימות ותיאום סיורים תוך כדי נסיעה',
];

const INCLUDED = [
  'CRM מתעניינים מלא ללא הגבלה',
  'תיבת שיחות מכל האפליקציות והרשתות',

  'ניהול נכסים ומלאי חי',
  'יצירת פוסטים, תזמון ופרסום לפייסבוק ואינסטגרם',
  'עוזר AI בווטסאפ כולל הודעות קוליות',
  'סנכרון Gmail ויומן גוגל',
  'אוטומציות, סיכומי שיחה ואימון AI',
  'משתמשים וצוות ללא הגבלה',
];

const FREE_TILES = [
  { image: imgOmnichannel, label: `${FREE_CONTACTS} אנשי קשר` },
  { image: imgPublishing, label: `${FREE_PROPERTIES} נכסים` },
  { image: imgAi, label: 'AI ללא הגבלה' },
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
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'will-change-transform transition-all duration-700 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-10 scale-[0.98] opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

const MAX_CONTACTS = 10_000;

export default function Landing() {
  const [contacts, setContacts] = useState(250);
  const [draft, setDraft] = useState('250');
  const quote = useMemo(() => quoteForContacts(contacts), [contacts]);
  const animatedPrice = useCounter(quote.monthlyPrice);
  const animatedContacts = useCounter(quote.contacts, 300);

  const applyContacts = (n: number) => {
    const clamped = Math.min(MAX_CONTACTS * 5, Math.max(0, Math.round(n)));
    setContacts(clamped);
    setDraft(String(clamped));
  };

  return (
    <div dir="rtl" className="realtyz-landing min-h-screen bg-background text-foreground antialiased">
      {/* ───────── Nav ───────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link to="/auth">
            <Button size="sm" className="font-bold">התחברות</Button>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">יכולות</a>
            <a href="#impact" className="transition-colors hover:text-foreground">תוצאות</a>
            <a href="#whatsapp" className="transition-colors hover:text-foreground">ווטסאפ AI</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">תמחור</a>
            <a href="#free" className="transition-colors hover:text-foreground">מסלול חינם</a>
          </nav>
          <Link to="/" aria-label="Realtyz AI">
            <img src={realtyzLogo} alt="Realtyz AI" className="h-[2.6rem] w-auto object-contain" />
          </Link>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="landing-aurora landing-aurora-a" />
          <div className="landing-aurora landing-aurora-b" />
          <div className="landing-grid absolute inset-0" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <Reveal>
            <p className="text-[15px] font-bold text-primary">
              ה-CRM הראשון בישראל שמנוהל על ידי סוכני AI
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
              כל העסק שלכם על טייס אוטומטי
              <span className="landing-gradient-text block"> ישר מהווטסאפ, 24 שעות ביממה</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              פוסטים אוטומטיים לקבוצות פייסבוק ואינסטגרם, ניהול אומני-צ'אנל, עוזר AI שמדבר איתכם
              בהקלטות קוליות בווטסאפ וסנכרון מלא לגוגל. הכל בעברית, הכל תחת השליטה שלכם.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="group h-14 w-full px-8 text-base font-extrabold shadow-2xl shadow-primary/25 sm:w-auto">
                  התחל בחינם - בלי כרטיס אשראי
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
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{FREE_CONTACTS} אנשי קשר חינם</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{FREE_PROPERTIES} נכסים</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />הכל כלול ללא הגבלה</span>
            </div>
          </Reveal>

          {/* Channels — plain icons, no chips, no backgrounds */}
          <Reveal delay={400}>
            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {CHANNELS.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                  <c.icon className="h-5 w-5 text-primary" strokeWidth={2.25} />
                  {c.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Features (image cards, no icons) ───────── */}
      <section id="features" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              כל מה שמתווך צריך - במערכת אחת
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
              הכל כלול ללא הגבלה. בלי תוספות, בלי עלויות נסתרות.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <article className="landing-card group relative h-full min-h-[15rem] overflow-hidden rounded-2xl border border-border/70 transition-transform duration-300 will-change-transform hover:-translate-y-1.5">
                  <img
                    src={f.image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    width={1024}
                    height={640}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div aria-hidden className="landing-card-veil absolute inset-0" />
                  <div className="relative flex h-full flex-col justify-end p-6">
                    <h3 className="text-lg font-extrabold text-white drop-shadow">{f.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-white/85">{f.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Impact charts ───────── */}
      <section id="impact" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              ניהול העסק מקצה לקצה - במספרים
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
              מהרגע שהליד נכנס ועד סגירת העסקה: מענה מיידי, מעקב אוטומטי ותמונת מצב עסקית אחת.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-12">
            <BenefitCharts />
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {[
                { value: '45 שניות', label: 'זמן מענה ממוצע לליד חדש' },
                { value: '+38%', label: 'שיפור בשיעור ההמרה לפגישה' },
                { value: '12 שעות', label: 'חיסכון שבועי בעבודה ידנית' },
              ].map((s) => (
                <div key={s.label} className="landing-card rounded-2xl border border-border/70 bg-card p-6 text-center">
                  <p className="text-3xl font-extrabold tabular-nums text-primary">{s.value}</p>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── WhatsApp super assistant ───────── */}
      <section id="whatsapp" className="relative overflow-hidden border-t border-border/60 py-20">
        <div aria-hidden className="landing-aurora landing-aurora-c pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="text-sm font-bold text-primary">העוזר האישי שלכם בווטסאפ</p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                מנהלים את כל העסק מהווטסאפ - גם בהקלטה קולית
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                שולחים הודעה קולית או טקסט, וה-AI מבצע: בודק סטטוס לקוח, שולף סטטיסטיקות,
                מפעיל מבצע, פותח משימות ומתאם סיורים - בזמן אמת, בלי לפתוח את המערכת.
              </p>
              <Link to="/auth" className="mt-7 inline-block">
                <Button size="lg" className="h-14 px-8 text-base font-extrabold">
                  נסו את זה בחינם עכשיו
                </Button>
              </Link>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <ul className="landing-card space-y-3 rounded-3xl border border-border/70 bg-card p-6 sm:p-8">
              {WHATSAPP_POWERS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] leading-relaxed">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ───────── Pricing calculator ───────── */}
      <section id="pricing" className="relative overflow-hidden border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-4xl px-4">
          <Reveal>
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                תמחור מדורג. שקוף. לפי אנשי קשר בלבד.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                הכל כלול ללא הגבלה (למעט IVR ושיחות AI קוליות שמתומחרים לפי צריכה בפועל).
                אפס עלויות נסתרות, ובמסלול החינמי גם בלי כרטיס אשראי.
              </p>
            </div>
          </Reveal>

          {/* Tiers */}
          <Reveal delay={80}>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {PRICING_TIERS.map((t, i) => (
                <div
                  key={t.label}
                  className={cn(
                    'landing-card rounded-2xl border bg-card p-5 text-center transition-transform duration-300 will-change-transform hover:-translate-y-1',
                    quote.tierIndex === i && !quote.isFree
                      ? 'border-primary shadow-lg shadow-primary/20'
                      : 'border-border/70',
                  )}
                >
                  <p className="text-sm font-semibold text-muted-foreground">{t.label}</p>
                  <p className="mt-2 text-3xl font-extrabold tabular-nums text-primary">
                    <bdi dir="ltr">{fmtILS(t.rate, { fractionDigits: 2 })}</bdi>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">לאיש קשר / חודש</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="landing-card mt-8 rounded-3xl border border-border/70 bg-card p-6 sm:p-9">
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold tabular-nums text-primary sm:text-6xl">
                    <bdi dir="ltr">{fmtILS(animatedPrice)}</bdi>
                  </span>
                  <span className="pb-2 text-sm font-semibold text-muted-foreground">/ חודש</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {quote.isFree
                    ? `עד ${FREE_CONTACTS} אנשי קשר - חינם, בלי כרטיס אשראי`
                    : <>{fmtILS(quote.ratePerContact, { fractionDigits: 2 })} לאיש קשר · {FREE_CONTACTS} הראשונים חינם</>}
                </p>
                {!quote.isFree && (
                  <p className="mt-1 text-xs font-bold text-primary">{quote.tierLabel}</p>
                )}
              </div>

              <div className="mt-9">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
                  <span className="text-muted-foreground">כמה אנשי קשר יש לכם?</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        const n = Number(e.target.value);
                        if (e.target.value !== '' && Number.isFinite(n)) applyContacts(n);
                      }}
                      onBlur={() => applyContacts(Number(draft) || 0)}
                      aria-label="הקלדת מספר אנשי קשר"
                      className="h-10 w-28 text-center text-base font-bold tabular-nums"
                    />
                    <span className="tabular-nums text-muted-foreground">
                      {animatedContacts.toLocaleString('he-IL')}
                    </span>
                  </div>
                </div>
                <Slider
                  dir="rtl"
                  value={[Math.min(contacts, MAX_CONTACTS)]}
                  min={0}
                  max={MAX_CONTACTS}
                  step={1}
                  onValueChange={(v) => applyContacts(v[0])}
                  aria-label="כמות אנשי קשר"
                  className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:transition-transform [&_[role=slider]]:active:scale-110"
                />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>0</span><span>1,000</span><span>5,000</span><span>10,000+</span>
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
                  <span>הכל כלול ללא הגבלה</span>
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
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">מסלול חינם</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {FREE_CONTACTS} אנשי קשר, {FREE_PROPERTIES} נכסים, כל יכולות ה-AI פתוחות.
              ללא הגבלת זמן, ללא כרטיס אשראי, בלי שיחת מכירה.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-9 grid max-w-2xl grid-cols-3 gap-3 sm:gap-4">
              {FREE_TILES.map((s) => (
                <div
                  key={s.label}
                  className="landing-card relative overflow-hidden rounded-2xl border border-border/70 transition-transform duration-300 will-change-transform hover:-translate-y-1"
                >
                  <img
                    src={s.image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    width={1024}
                    height={640}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div aria-hidden className="landing-card-veil absolute inset-0" />
                  <p className="relative px-3 py-10 text-sm font-extrabold text-white drop-shadow sm:text-base">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <Link to="/auth" className="mt-10 inline-block">
              <Button size="lg" className="h-14 px-10 text-base font-extrabold shadow-2xl shadow-primary/25">
                פתיחת חשבון וכניסה מיידית למערכת
              </Button>
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-sm text-muted-foreground">
        <p>Realtyz - מערכת ניהול נדל"ן מבוססת AI · כל הזכויות שמורות</p>
      </footer>
    </div>
  );
}
