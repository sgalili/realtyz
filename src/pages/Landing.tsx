import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowLeft, Check, Star } from 'lucide-react';
import { FREE_CONTACTS, FREE_PROPERTIES } from '@/lib/pricing';
import PricingSection from '@/components/landing/PricingSection';
import CreditsSection from '@/components/landing/CreditsSection';
import { cn } from '@/lib/utils';


import { PlatformTicker, StackTicker } from '@/components/landing/LogoTickers';
import realtyzLogo from '@/assets/realtyz-logo.png';
import imgPublishing from '@/assets/landing/card-publishing.jpg';
import imgOmnichannel from '@/assets/landing/card-omnichannel.jpg';
import imgVoice from '@/assets/landing/card-voice.jpg';
import imgCalendar from '@/assets/landing/card-calendar.jpg';
import imgAi from '@/assets/landing/card-ai.jpg';
import imgAnalytics from '@/assets/landing/card-analytics.jpg';
import imgAutoPost from '@/assets/landing/card-autopost.jpg';
import imgGoogleSync from '@/assets/landing/card-google-sync.jpg';
import imgMatchmaking from '@/assets/landing/card-matchmaking.jpg';


/* ────────────────────────────────────────────────────────────────
   Realtyz — דף נחיתה (RTL). פלטת הצבעים של האפליקציה בלבד:
   נייבי #0B2545, זהב #FFC800, לבן וקנבס אפור רך.
   ללא תגיות/פילים, ללא רקעים לאייקונים - כרטיסים עם תמונת רקע.
   ──────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    image: imgAutoPost,
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
    image: imgGoogleSync,
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
    image: imgMatchmaking,
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

const FAQ: { q: string; a: string }[] = [
  {
    q: 'איך התמחור עובד?',
    a: 'מחיר חודשי קבוע לפי חבילה - חינם, בסיס ₪145, מקצועי ₪495 וסוכנות ₪795. אין תמחור לפי איש קשר ואין עלויות נסתרות. שירותים בצריכה בפועל (SMS, הודעות WhatsApp בתשלום, שיחות AI קוליות) נגרעים מארנק קרדיטים נפרד.',
  },
  {
    q: 'מה זה "מגע קרדיט" (T.C) ואיך הוא נספר?',
    a: 'מגע אחד = פעולה אחת של ה-AI מול איש קשר: תשובה בוואטסאפ, SMS, אימייל, שיחה קולית, IVR או מענה לתגובה. שיחת וואטסאפ שלמה נספרת כמגע אחד בחלון של 24 שעות, גם אם הוחלפו בה עשרות הודעות.',
  },
  {
    q: 'כמה מגעים כלולים בחבילה?',
    a: '15 מגעים לכל איש קשר בכל חודש, בכל הערוצים, כלולים במלואם בכל החבילות - כולל מסלול החינם. המכסה נמדדת לכל איש קשר בנפרד ומתאפסת בתחילת כל חודש קלנדרי.',
  },
  {
    q: 'איך מחושב חיוב על חריגה מהמגעים?',
    a: 'החיוב הוא לפי איש קשר ולא לפי נפח מצטבר: כל איש קשר שעבר את מכסת 15 המגעים באותו חודש מחויב ב-0.05 ₪ נוספים, ללא תלות בכמה מגעים נוספים בוצעו מולו. לדוגמה, 40 אנשי קשר שחרגו = 2 ₪ בסך הכול. הסכום נגרע מארנק הקרדיטים שניתן לטעון בתוך המערכת בכל רגע.',
  },
  {
    q: 'על מה כן משלמים בנפרד?',
    a: 'כל פעולה שה-AI מבצע כלולה במכסת המגעים. חיוב נפרד חל רק על הפצה פרטית שאתם יוזמים בעצמכם, לפי תעריף: SMS 0.01 ₪ להודעה, וואטסאפ 0.20 ₪ לחלון שיחה של 24 שעות, שיחת AI קולית 1 ₪ לדקה, IVR 0.20 ₪ לשיחה ואימייל 0.01 ₪ להודעה. המחירים אינם כוללים מע"מ.',
  },
  {
    q: 'האם יש התחייבות או חוזה?',
    a: 'אין. כל החבילות חודשיות ומתחדשות אוטומטית עד שאתם מבטלים, בכל רגע, ללא דמי ביטול.',
  },
  {
    q: 'איך מבטלים את המנוי?',
    a: 'בלחיצה אחת מתוך המערכת, בעמוד ניהול החבילה. הביטול מיידי והחיוב העתידי נעצר מיד - בלי שיחות שכנוע ובלי טפסים.',
  },
  {
    q: 'האם יש החזר כספי?',
    a: 'לא. איננו מעניקים החזרים על תשלומים שבוצעו או על קרדיטים שנרכשו, אך הביטול מיידי והחיוב נעצר. הגישה לחבילה נשמרת עד סוף מחזור החיוב ששולם.',
  },
  {
    q: 'מה כולל מסלול החינם?',
    a: `${FREE_CONTACTS} אנשי קשר, ${FREE_PROPERTIES} נכסים וכל יכולות ה-AI פתוחות - ללא הגבלת זמן וללא כרטיס אשראי.`,
  },
  {
    q: 'צריך כרטיס אשראי כדי להתחיל?',
    a: 'לא. נרשמים ונכנסים למערכת מיד. כרטיס אשראי נדרש רק כשבוחרים חבילה בתשלום.',
  },
  {
    q: 'אפשר לשנות חבילה באמצע החודש?',
    a: 'כן. שדרוג נכנס לתוקף מיד עם חיוב יחסי, והורדת חבילה נכנסת לתוקף במחזור החיוב הבא.',
  },
  {
    q: 'מה קורה אם עברתי את מגבלת אנשי הקשר או הנכסים?',
    a: 'המערכת מתריעה ומציעה שדרוג. הנתונים הקיימים נשמרים, אך הוספת רשומות חדשות תיחסם עד לשדרוג.',
  },
  {
    q: 'איך מתחברים לווטסאפ?',
    a: 'המערכת עובדת עם WhatsApp Business API הרשמי של Meta. החיבור מוגדר עבורכם, וההודעות היוצאות והנכנסות מרוכזות בתיבה אחת בתוך המערכת.',
  },
  {
    q: 'ה-AI שולח הודעות ללקוחות בלי אישור שלי?',
    a: 'אתם שולטים במלואו. יש תור אישורים לפני שליחה, כפתור עצירה מיידי לכל פעולות ה-AI, ויומן פעילות שמתעד כל פעולה שבוצעה.',
  },
  {
    q: 'איך המערכת מפרסמת לפייסבוק ולאינסטגרם?',
    a: 'דרך ממשקי Meta הרשמיים: ה-AI מכין את הפוסט ואת התגובה הראשונה, אתם מאשרים, והמערכת מתזמנת ומפרסמת לעמודים, לקבוצות ולאינסטגרם.',
  },
  {
    q: 'האם המידע של הלקוחות שלי מבודד ומאובטח?',
    a: 'כן. בידוד מלא ברמת סביבת עבודה (Row Level Security), הצפנה בתעבורה ובמנוחה, הרשאות לפי תפקיד, אימות דו-שלבי ויומני ביקורת. איננו מוכרים נתונים ואיננו חושפים אותם למשתמשים אחרים.',
  },
  {
    q: 'אפשר לייבא נתונים מ-Excel או ממערכת אחרת?',
    a: 'כן. יש ייבוא CSV/XLSX עם מיפוי כותרות בעברית, זיהוי כפילויות אוטומטי, וכן סנכרון מלאי חי מיד2 ומ-Homely.',
  },
  {
    q: 'אפשר להוסיף את הצוות שלי?',
    a: 'כן. בחבילת מקצועי עד 5 משתמשים ובחבילת סוכנות ללא הגבלה, כולל הרשאות לפי תפקיד, פיקוח ויומן פעילות.',
  },
  {
    q: 'מה קורה לנתונים שלי אם אני מפסיק להשתמש?',
    a: 'הנתונים נשארים שלכם. ניתן לייצא הכול ל-CSV/XLSX בכל עת, וגם לאחר סגירת החשבון נשמרת אפשרות ייצוא לתקופה סבירה לפני מחיקה.',
  },
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

export default function Landing() {


  return (
    <div dir="rtl" className="realtyz-landing min-h-screen bg-background text-foreground antialiased">
      {/* ───────── Nav ───────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link
            to="/auth"
            className="text-sm font-extrabold text-primary underline-offset-4 transition-colors hover:underline"
          >
            הרשמה/התחברות
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">יכולות</a>
            <a href="#whatsapp" className="transition-colors hover:text-foreground">ווטסאפ AI</a>
            <a href="#free" className="transition-colors hover:text-foreground">מסלול חינם</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">מחירים</a>
            <a href="#faq" className="transition-colors hover:text-foreground">שאלות נפוצות</a>


          </nav>
          <Link to="/" aria-label="Realtyz AI">
            <img src={realtyzLogo} alt="Realtyz AI" className="h-[3.12rem] w-auto object-contain" />
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

        <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-8 text-center sm:pt-10">
          <Reveal delay={80}>
            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
              <span className="landing-title-gradient block">AI למתווכים וסוכנויות נדל״ן</span>
              <span className="landing-gradient-text block">טייס אוטומטי על סטרואידים</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              סוכני AI שמנהלים 24/7 את כל הלידים, נכסים, התאמות, שיווק, תקשורת ומעקבים בשליטה מלאה מהווטסאפ שלכם
            </p>
          </Reveal>

          {/* Platforms — official brand logos, infinite scroll, no labels */}
          <Reveal delay={400}>
            <div className="mt-6">
              <p className="mb-1 text-sm font-extrabold tracking-widest text-muted-foreground">
                כל הכלים במקום אחד
              </p>
              <PlatformTicker />
            </div>
          </Reveal>

          {/* Metric cards */}
          <div className="mx-auto mt-5 grid w-full max-w-4xl grid-cols-3 gap-2 sm:gap-3">
            {[
              { value: '320% +', label: 'מענה ללידים חדשים' },
              { value: '15 שעות', label: 'חיסכון שבועי למתווך' },
              { value: '99.4%', label: 'מעורבות והמרה' },
            ].map((m) => (
              <div
                key={m.value}
                className="rounded-2xl border border-border/60 bg-card p-2 sm:p-4 text-center shadow-sm"
              >
                <div className="text-xl sm:text-3xl font-extrabold tracking-tight text-primary">{m.value}</div>
                <div className="mt-1 text-xs sm:text-sm font-semibold leading-snug text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Infrastructure trust row */}
          <div className="mt-5 pt-[10px]">
            <p className="text-sm font-extrabold tracking-widest text-muted-foreground">
              תשתית טכנולוגית
            </p>

            <div className="mt-2">
              <StackTicker />
            </div>
          </div>

        </div>
      </section>

      {/* ───────── All-in-One: מחליף את כל הכלים החיצוניים ───────── */}
      <section id="all-in-one" className="border-t border-border/60 pt-[15px] pb-20">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal>
            <h2 className="landing-title-gradient text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              מערכת אחת שמחליפה את כולם!
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-muted-foreground">
              אין יותר צורך במנויים נפרדים לכתיבת פוסטים, תזמון פוסטים, ניהול נכסים, ניהול לידים, שליחת הודעות, ניהול יומן, דוחות. Realtyz היא לוח בקרה אחד שכולל את כל הכלים שמתווך צריך בעידן ה AI.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { t: 'תזמון ופרסום תוכן', d: 'יצירת פוסטים, תזמון ופרסום לכל הרשתות והקבוצות - בלי כלי חיצוני.' },
                { t: 'ניהול לידים ועסקאות', d: 'CRM מלא עם פייפליין, מעקבים, סיכומי שיחה והתאמת נכסים.' },
                { t: 'הודעות בכל הערוצים', d: 'ווטסאפ, SMS, אימייל ורשתות חברתיות מתיבה אחת מסונכרנת.' },
                { t: 'יומן ותיאום צפיות', d: 'סנכרון יומן דו-כיווני, תיאום צפיות ותזכורות אוטומטיות.' },
                { t: 'דוחות וניתוח עסקי', d: 'זמני תגובה, שיעורי המרה, עמלות ותחזית הכנסות בזמן אמת.' },
                { t: 'כתיבה ותמלול AI', d: 'טקסטים שיווקיים, תשובות ללקוחות ותמלול הקלטות קוליות.' },
              ].map((item) => (
                <div key={item.t} className="rounded-2xl border border-border/60 bg-card/60 p-6 text-right">
                  <h3 className="text-xl font-extrabold">{item.t}</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{item.d}</p>
                </div>
              ))}
            </div>
          </Reveal>

        </div>
      </section>


      {/* ───────── Features (image cards, no icons) ───────── */}
      <section id="features" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal>
            <h2 className="landing-title-gradient text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              כל מה שמתווך צריך
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <article className="landing-card group relative h-full min-h-[11.5rem] overflow-hidden rounded-2xl border border-border/70 transition-transform duration-300 will-change-transform hover:-translate-y-1.5">
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
                  <div className="relative flex h-full flex-col justify-end p-4">
                    <h3 className="text-lg font-extrabold text-white drop-shadow transition-all duration-300 group-hover:text-[21px]">{f.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-snug text-white/90 transition-all duration-300 group-hover:text-[17px]">{f.body}</p>
                  </div>

                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>




      {/* ───────── WhatsApp super assistant ───────── */}
      <section id="whatsapp" className="relative overflow-hidden border-t border-border/60 py-20">
        <div aria-hidden className="landing-aurora landing-aurora-c pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <Reveal>
            <div>
              <h2 className="landing-title-gradient mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                מנהלים את כל העסק מהווטסאפ
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                שולחים הודעה קולית או טקסט, וה-AI מבצע: בודק סטטוס לקוח, שולף סטטיסטיקות,
                פותח משימות ומתאם סיורים בזמן אמת.
              </p>
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




      {/* ───────── Freemium ───────── */}
      <section id="free" className="border-t border-border/60 py-20">
        <div className="mx-auto w-full max-w-4xl px-4 text-center">
          <Reveal>
            <h2 className="landing-title-gradient text-3xl font-extrabold tracking-tight sm:text-4xl">מסלול חינם</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {FREE_CONTACTS} אנשי קשר, {FREE_PROPERTIES} נכסים, כל יכולות ה-AI פתוחות.
              ללא הגבלת זמן, ללא כרטיס אשראי, בלי שיחת מכירה.
            </p>
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

      {/* ───────── Pricing ───────── */}
      <PricingSection />
      <CreditsSection />


      {/* ───────── FAQ ───────── */}
      <section id="faq" className="border-t border-border/60 pb-20 pt-[60px]">
        <div className="mx-auto w-full max-w-3xl px-4">
          <Reveal>
            <h2 className="landing-title-gradient text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              שאלות נפוצות
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <Accordion type="single" collapsible className="mt-10 w-full">
              {FAQ.map((item, i) => (
                <AccordionItem key={item.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-right text-base font-extrabold">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-sm text-muted-foreground">
        <p>Realtyz - מערכת ניהול נדל"ן מבוססת AI · כל הזכויות שמורות</p>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-semibold">
          <Link to="/terms" className="transition-colors hover:text-foreground">תנאי שימוש</Link>
          <Link to="/privacy-policy" className="transition-colors hover:text-foreground">מדיניות פרטיות</Link>
          <a href="mailto:support@realtyz.co.il" className="transition-colors hover:text-foreground">
            support@realtyz.co.il
          </a>
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/80">
          <Star className="h-3 w-3 text-primary" aria-hidden />
          פותח בגאווה בישראל · Proudly made in Israel
        </p>
      </footer>

    </div>
  );
}
