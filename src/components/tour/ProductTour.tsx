import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';

import { META_APP_ID } from '@/lib/metaApp';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { useQueryClient } from '@tanstack/react-query';
import realtyzLogo from '@/assets/realtyz-logo.png';

/* Realtyz — סיור מוצר לנרשמים חדשים.
   טקסט גדול, הסברים קצרים, וכולל מקטע תמחור לפי חבילות. */

type TourStep = {
  eyebrow: string;
  title: string;
  bullets: string[];
  cta?: { label: string; to: string };
  connections?: boolean;
  profileForm?: boolean;
};

const STEPS: TourStep[] = [
  {
    eyebrow: 'ברוכים הבאים',
    title: 'Realtyz מנהלת את הלידים שלך 24/7',
    bullets: [
      'כל פנייה נכנסת מקבלת מענה תוך שניות.',
      'הכל במקום אחד: שיחות, נכסים, משימות ופרסום.',
      'ההדרכה לוקחת דקה. אפשר לצאת בכל רגע.',
    ],
  },
  {
    eyebrow: 'הפרטים שלך',
    title: 'נכיר אותך רגע לפני שמתחילים',
    bullets: [
      'השם שלך יופיע בהודעות, בפוסטים ובדפים המשותפים.',
      'עיר הפעילות תהיה אזור החיפוש הקבוע שלך בכל האפליקציה.',
    ],
    profileForm: true,
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
    ],
    cta: { label: 'פתח נכסים', to: '/properties' },
  },
  {
    eyebrow: '',
    title: 'חיבור חשבון Facebook',
    bullets: [
      'כתיבה ופרסום פוסטים AI בקבוצות ',
      'מענה אוטומטי AI לתגובות בפייסבוק',
      'צ׳אטים עם סוכני ה- AI ב-Messenger',
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [activityCity, setActivityCity] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  /** Persists the intake details: name, optional email and the default work city. */
  const saveProfileDetails = async () => {
    if (!user) return;
    const name = fullName.trim();
    const mail = email.trim();
    const city = activityCity.trim();
    if (!name && !mail && !city) return;
    setSavingProfile(true);
    try {
      const patch: Record<string, any> = {};
      if (name) patch.full_name = name;
      if (mail) patch.email = mail;
      if (city) {
        patch.city = city;
        patch.service_areas = [city];
      }
      if (Object.keys(patch).length) {
        await supabase.from('profiles').update(patch as never).eq('id', user.id);
      }
      const metaPatch: Record<string, unknown> = {};
      if (name) metaPatch.full_name = name;
      if (city) metaPatch.activity_city = city;
      if (Object.keys(metaPatch).length) await supabase.auth.updateUser({ data: metaPatch });
      queryClient.invalidateQueries({ queryKey: ['service_areas'] });
    } catch {
      // non-fatal — the user can complete this later in the profile page
    } finally {
      setSavingProfile(false);
    }
  };

  // Manual replay (the "?" button in the sidebar) always opens the tour.
  useEffect(() => {
    const replay = () => { setIndex(0); setOpen(true); };
    window.addEventListener('realtyz:start-tour', replay);
    return () => window.removeEventListener('realtyz:start-tour', replay);
  }, []);

  useEffect(() => {
    if (!user) return;
    const key = `${LOCAL_KEY}:${user.id}`;
    if (window.localStorage.getItem(key) === '1') return;

    // Auto-open only for brand-new signups. Existing accounts are marked as
    // done silently and can replay the tour from the sidebar "?" button.
    const createdAt = Date.parse(String((user as any).created_at ?? '')) || 0;
    const isNewSignup = createdAt > 0 && Date.now() - createdAt < 10 * 60_000;
    if (!isNewSignup) {
      window.localStorage.setItem(key, '1');
      return;
    }

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
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaName = String(meta.full_name ?? meta.name ?? '').trim();
      if (metaName) setFullName(metaName);
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
    // Best-effort: pull the owner's WhatsApp photo as their profile picture.
    void supabase.functions.invoke('sync-owner-wa-avatar').catch(() => {});
    // New signups land on their profile to complete their details.
    navigate(navigateTo ?? '/profile?welcome=1');
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
          {step.profileForm && (
            <div className="mt-6 space-y-4 text-right" dir="rtl">
              <div className="space-y-1.5">
                <Label className="text-base font-bold">שם מלא</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="למשל: אודי ויטמן"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-base font-bold">כתובת אימייל</Label>
                <Input
                  dir="ltr"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-12 text-left text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-base font-bold">עיר הפעילות שלך</Label>
                <IsraeliCityPicker value={activityCity} onChange={setActivityCity} placeholder="בחר עיר" />
              </div>
            </div>
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
            דלג על ההדרכה
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
              disabled={savingProfile}
              onClick={() => void (async () => {
                if (step.profileForm) await saveProfileDetails();
                if (isLast) await finish();
                else setIndex((i) => i + 1);
              })()}
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
