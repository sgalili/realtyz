import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { PACKAGES, FREE_CONTACTS, FREE_PROPERTIES, limitLabel } from '@/lib/pricing';
import { META_APP_ID } from '@/lib/metaApp';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import realtyzLogo from '@/assets/realtyz-logo.png';

/* Realtyz — סיור מוצר לנרשמים חדשים.
   טקסט גדול, הסברים קצרים, וכולל מקטע תמחור לפי איש קשר פעיל. */

type TourStep = {
  eyebrow: string;
  title: string;
  bullets: string[];
  cta?: { label: string; to: string };
  connections?: boolean;
};

const STEPS: TourStep[] = [
  {
    eyebrow: 'ברוכים הבאים',
    title: 'Realtyz מנהלת את הלידים שלך 24/7',
    bullets: [
      'כל פנייה נכנסת מקבלת מענה תוך שניות.',
      'הכל במקום אחד: שיחות, נכסים, משימות ופרסום.',
      'הסיור לוקח דקה. אפשר לצאת בכל רגע.',
    ],
  },
  {
    eyebrow: 'משימות היום',
    title: 'לוח הבקרה שאומר לך מה לעשות עכשיו',
    bullets: [
      'רשימת מעקבים לפי דחיפות, בלי לחפש כלום.',
      'מדדים חיים: לידים פעילים ופניות שממתינות לתשובה.',
      'לחיצה אחת ואתה בשיחה, בנכס או במשימה.',
    ],
    cta: { label: 'פתח את משימות היום', to: '/command-center' },
  },
  {
    eyebrow: 'שיחות מכל האפליקציות',
    title: 'תיבה אחת לכל הערוצים',
    bullets: [
      'ווטסאפ, פייסבוק, אינסטגרם, SMS ואימייל באותו מסך.',
      'כל ההיסטוריה של הלקוח מרוכזת בכרטיס אחד.',
      'ה-AI עונה בשמך, ואתה מאשר או משתלט מתי שתרצה.',
    ],
    cta: { label: 'פתח שיחות', to: '/live-conversations' },
  },
  {
    eyebrow: 'נכסים ופרסום',
    title: 'נכס נכנס - פוסט יוצא',
    bullets: [
      'הנכסים נטענים ונשמרים אצלך עם כל הפרטים והתמונות.',
      'ה-AI כותב את הפוסט ומפרסם לקבוצות פייסבוק ולאינסטגרם.',
      'תזמון מראש, וריאציות טקסט ותמונות כדי להישאר בטוח.',
    ],
    cta: { label: 'פתח נכסים', to: '/properties' },
  },
  {
    eyebrow: 'תמחור',
    title: 'חבילות במחיר חודשי קבוע',
    bullets: [
      `חינם: עד ${FREE_CONTACTS} אנשי קשר ו-${FREE_PROPERTIES} נכסים, בלי כרטיס אשראי.`,
      ...PACKAGES.filter((p) => p.monthlyPrice > 0).map(
        (p) => `${p.name}: ₪${p.monthlyPrice} לחודש · ${limitLabel(p.contacts)} אנשי קשר · ${limitLabel(p.properties)} נכסים · ${limitLabel(p.seats)} משתמשים.`,
      ),
      'שיטת החישוב: מחיר החבילה החודשי + ארנק קרדיטים לשירותים בצריכה בפועל (SMS, הודעות WhatsApp בתשלום, IVR ושיחות AI קוליות).',
      'מעבר בין חבילות בכל רגע, בלי התחייבות ובלי עלויות נסתרות.',
    ],
    cta: { label: 'צפה בתמחור ובחשבון', to: '/billing' },
  },
  {
    eyebrow: 'חיבורים',
    title: 'מחברים רק את החשבונות שלך',
    bullets: [
      'שום חשבון Facebook לא מתחבר אוטומטית - רק בלחיצה שלך.',
      'WhatsApp כבר מחובר לכולם דרך המספר הרשמי של Realtyz ב-Meta Cloud API.',
      'כל החיבורים והמידע נשמרים בסביבת העבודה שלך בלבד.',
    ],
    connections: true,
  },
];

const LOCAL_KEY = 'realtyz-product-tour-done';

const FB_SCOPES = 'public_profile,pages_show_list,pages_manage_posts,pages_read_engagement';

/** Opens Facebook Login immediately (no server round-trip, no error page). */
function startFacebookLogin() {
  const state = `facebook_page:${crypto.randomUUID()}:${btoa(encodeURIComponent(oauthReturnOrigin()))}`;
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: FB_SCOPES,
    state,
    auth_type: 'rerequest',
  });
  openOAuthWindow(`https://www.facebook.com/v26.0/dialog/oauth?${params}`);
}

export function ProductTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!user) return;
    const key = `${LOCAL_KEY}:${user.id}`;
    if (window.localStorage.getItem(key) === '1') return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('onboarding_progress')
        .select('metadata')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const done = !!((data?.metadata as any)?.product_tour_done);
      if (done) {
        window.localStorage.setItem(key, '1');
        return;
      }
      setOpen(true);
    })().catch(() => setOpen(true));
    return () => { cancelled = true; };
  }, [user]);

  const finish = async (navigateTo?: string) => {
    setOpen(false);
    if (user) {
      window.localStorage.setItem(`${LOCAL_KEY}:${user.id}`, '1');
      try {
        const { data } = await supabase
          .from('onboarding_progress')
          .select('metadata')
          .eq('user_id', user.id)
          .maybeSingle();
        const meta = { ...((data?.metadata as any) ?? {}), product_tour_done: true };
        await supabase
          .from('onboarding_progress')
          .upsert({ user_id: user.id, metadata: meta }, { onConflict: 'user_id' });
      } catch {
        // non-fatal
      }
    }
    if (navigateTo) navigate(navigateTo);
  };

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const progress = useMemo(() => ((index + 1) / STEPS.length) * 100, [index]);

  if (!open || !step) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void finish(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl overflow-hidden border-border/60 p-0"
      >
        <div className="bg-primary/10 px-8 pt-8 pb-6">
          <div className="flex items-center justify-between gap-4">
            <img src={realtyzLogo} alt="Realtyz AI" className="h-9 w-auto object-contain" />
            <span className="text-sm font-bold text-muted-foreground">
              {index + 1} מתוך {STEPS.length}
            </span>
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-base font-extrabold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {step.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {step.title}
          </h2>
        </div>

        <div className="px-8 py-6">
          <ul className="space-y-4">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-lg leading-relaxed sm:text-xl">
                <Check className="mt-1.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {step.cta && (
            <Button
              variant="outline"
              className="mt-6 h-12 w-full justify-between text-base font-bold"
              onClick={() => void finish(step.cta!.to)}
            >
              <span>{step.cta.label}</span>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
          {step.connections && (
            <div className="mt-6">
              <Button
                className="h-12 w-full justify-between text-base font-bold"
                onClick={() => { startFacebookLogin(); void finish('/profile?tab=connections'); }}
              >
                <span>חיבור Facebook</span>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>

        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-5">
          <Button variant="ghost" className="text-base" onClick={() => void finish()}>
            דלג על הסיור
          </Button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button
                variant="outline"
                className="h-11 text-base"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                חזור
              </Button>
            )}
            <Button
              className={cn('h-11 text-base font-bold')}
              onClick={() => (isLast ? void finish() : setIndex((i) => i + 1))}
            >
              {isLast ? 'מתחילים לעבוד' : 'הבא'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProductTour;
