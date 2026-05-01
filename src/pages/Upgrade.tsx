import { Link } from 'react-router-dom';
import {
  Crown,
  ShieldCheck,
  Sparkles,
  Infinity as InfinityIcon,
  Map as MapIcon,
  BrainCircuit,
  PhoneCall,
  ArrowLeft,
  Check,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * High-conversion Upgrade page. "Governmental / Professional" aesthetic
 * with Navy + Gold accents. Designed mobile-first for listings making
 * fast decisions on the go.
 */
export default function Upgrade() {
  const handleBookCall = () => {
    // Placeholder: route to contact form / scheduling
    window.location.href = '/contact?intent=upgrade';
  };

  const includedItems = [
    {
      icon: PhoneCall,
      title: 'VIP Onboarding',
      desc: 'ליווי אישי בהגדרת המערכת וה-WBA האישי שלך',
    },
    {
      icon: BrainCircuit,
      title: 'Brain Deep-Dive',
      desc: 'טיוב נתונים מקצועי של המצע והמסרים ע"י מומחי AI',
    },
    {
      icon: InfinityIcon,
      title: 'Unlimited Scale',
      desc: 'פתיחת המערכת לאלפי מתעניינים ללא הגבלת הודעות',
    },
    {
      icon: MapIcon,
      title: 'Strategic Blueprint',
      desc: 'בניית מסע מתעניין מותאם אישית למפת המכירות שלך',
    },
  ];

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-[hsl(220_45%_10%)] via-[hsl(220_40%_8%)] to-[hsl(220_50%_6%)] text-white"
    >
      {/* Subtle gold radial accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-[hsl(43_74%_49%)]/10 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-96 w-96 rounded-full bg-[hsl(43_74%_49%)]/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl px-5 py-10 sm:py-16">
        {/* Back */}
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          חזרה ללוח הבקרה
        </Link>

        {/* Hero */}
        <div className="text-center">
          <Badge
            variant="outline"
            className="mb-5 border-[hsl(43_74%_49%)]/40 bg-[hsl(43_74%_49%)]/10 text-[hsl(43_74%_65%)]"
          >
            <Crown className="me-1.5 h-3.5 w-3.5" />
            VIP Setup
          </Badge>

          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            הופכים את הקמפיין
            <br />
            <span className="bg-gradient-to-l from-[hsl(43_74%_55%)] via-[hsl(43_84%_65%)] to-[hsl(43_74%_55%)] bg-clip-text text-transparent">
              לניצחון בשטח
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            עוברים מ-Trial לפעולה. צוות המומחים שלנו מקים עבורך את כל המערכת,
            מטייב את המסרים ופותח את המנוע - כדי שתתמקד אך ורק בזכייה.
          </p>
        </div>

        {/* Pricing Card */}
        <Card className="relative mx-auto mt-12 max-w-3xl overflow-hidden border-[hsl(43_74%_49%)]/30 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(43_74%_55%)] to-transparent" />

          <div className="grid gap-8 sm:grid-cols-2 sm:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(43_74%_65%)]">
                הקמה חד-פעמית
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-5xl font-bold sm:text-6xl">₪5,000</span>
                <span className="text-sm text-white/50">חד-פעמי</span>
              </div>
              <p className="mt-3 text-sm text-white/60">
                כולל את כל חבילת ה-VIP Setup המפורטת מטה
              </p>
            </div>

            <div className="border-t border-white/10 pt-6 sm:border-t-0 sm:border-r sm:pr-6 sm:pt-0">
              <div className="text-xs font-semibold uppercase tracking-widest text-white/50">
                +  רישיון חודשי
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white sm:text-4xl">
                  Monthly License
                </span>
              </div>
              <p className="mt-3 text-sm text-white/60">
                גישה מלאה למנוע ה-AI, ה-CRM וה-Autopilot
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={handleBookCall}
              className="h-14 flex-1 bg-gradient-to-l from-[hsl(43_74%_49%)] to-[hsl(43_84%_58%)] text-base font-bold text-[hsl(220_50%_10%)] shadow-lg shadow-[hsl(43_74%_49%)]/20 hover:from-[hsl(43_74%_53%)] hover:to-[hsl(43_84%_62%)]"
            >
              <PhoneCall className="me-2 h-5 w-5" />
              Book My Setup Call
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleBookCall}
              className="h-14 flex-1 border-white/20 bg-white/5 text-base font-semibold text-white hover:bg-white/10"
            >
              <Sparkles className="me-2 h-5 w-5" />
              שדרג עכשיו
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            ללא התחייבות. ביטול בכל עת. תמיכה ישראלית מלאה.
          </div>
        </Card>

        {/* What's Included */}
        <div className="mt-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              מה כולל ה-VIP Setup
            </h2>
            <p className="mt-2 text-sm text-white/60">
              הקמת קמפיין שלם בידיים מקצועיות, ללא זמן בזבוז
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {includedItems.map((item) => (
              <Card
                key={item.title}
                className="group relative overflow-hidden border-white/10 bg-white/[0.03] p-6 transition-all hover:border-[hsl(43_74%_49%)]/40 hover:bg-white/[0.06]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(43_74%_49%)]/20 to-[hsl(43_74%_49%)]/5 ring-1 ring-[hsl(43_74%_49%)]/30">
                    <item.icon className="h-6 w-6 text-[hsl(43_84%_65%)]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">
                        {item.title}
                      </h3>
                      <Check className="h-4 w-4 text-[hsl(43_84%_65%)]" />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Social Proof */}
        <Card className="relative mt-12 overflow-hidden border-white/10 bg-gradient-to-l from-white/[0.06] via-white/[0.03] to-white/[0.06] p-8 text-center sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(43_74%_49%)]/15 ring-1 ring-[hsl(43_74%_49%)]/30">
            <Users className="h-7 w-7 text-[hsl(43_84%_65%)]" />
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/90 sm:text-xl">
            הצטרף למאות נכסים שכבר מנהלים את המטה שלהם ב-
            <span className="text-[hsl(43_84%_65%)]">Autopilot</span>
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/50">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              אבטחה ברמה ממשלתית
            </span>
            <span className="flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5" />
              ליווי VIP אישי
            </span>
            <span className="flex items-center gap-1.5">
              <InfinityIcon className="h-3.5 w-3.5" />
              ללא הגבלת הודעות
            </span>
          </div>
        </Card>

        {/* Final CTA */}
        <div className="mt-12 text-center">
          <Button
            size="lg"
            onClick={handleBookCall}
            className="h-14 bg-gradient-to-l from-[hsl(43_74%_49%)] to-[hsl(43_84%_58%)] px-10 text-base font-bold text-[hsl(220_50%_10%)] shadow-xl shadow-[hsl(43_74%_49%)]/20 hover:from-[hsl(43_74%_53%)] hover:to-[hsl(43_84%_62%)]"
          >
            <PhoneCall className="me-2 h-5 w-5" />
            תאם שיחת הקמה עכשיו
          </Button>
          <p className="mt-4 text-xs text-white/40">
            צוות הקמה ישראלי. זמינות תוך 24 שעות.
          </p>
        </div>
      </div>
    </div>
  );
}
