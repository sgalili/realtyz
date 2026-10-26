import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { completePartnerIntro } from '@/lib/partnerIntroPreference';
import { POST_SIGNUP_WELCOME_EVENT, readPostSignupWelcome, clearPostSignupWelcome, type SignupRole } from '@/lib/signupRole';
import { LandingContent } from '@/pages/Landing';
import { celebrateSignup } from '@/lib/rewardFeedback';
import { supabase } from '@/integrations/supabase/client';
import { fmtCredits } from '@/lib/credits';

const BENEFITS: Record<SignupRole, { title: string; items: [string, string][] }> = {
  property_seeker: { title: 'ברוכים הבאים ל-TORAFF!', items: [['🏠', 'כל הנכסים במקום אחד'], ['📣', 'פרסום נכס בחינם'], ['🤖', 'ריטה עונה בשבילכם 24/7'], ['🤝', 'פרופיל מלא = יותר אמון']] },
  property_owner: { title: 'ברוכים הבאים ל-TORAFF!', items: [['🔑', 'השכרה מהירה יותר'], ['👥', 'שותפים מביאים שוכרים'], ['🎯', 'סינון פניות אוטומטי'], ['🤝', 'פרופיל מלא = יותר אמון']] },
  developer: { title: 'ברוכים הבאים ל-TORAFF!', items: [['🏗️', 'ייבוא פרויקטים מיד2'], ['📈', 'רשת שיווק שלמה'], ['💸', 'משלמים רק על תוצאות'], ['🤝', 'פרופיל מלא = יותר אמון']] },
  contractor: { title: 'ברוכים הבאים ל-TORAFF!', items: [['🏗️', 'ייבוא פרויקטים מיד2'], ['📈', 'רשת שיווק שלמה'], ['💸', 'משלמים רק על תוצאות'], ['🤝', 'פרופיל מלא = יותר אמון']] },
  broker: { title: 'ברוכים הבאים ל-TORAFF!', items: [['🏢', 'נכסים ופרויקטים לשיווק'], ['💰', '80% מעמלות הסגירה'], ['🤖', 'ריטה ופייסבוק בענן'], ['🤝', 'פרופיל מלא = יותר אמון']] },
  partner: { title: 'ברוכים הבאים לשותפים!', items: [['🔗', 'משתפים קישור אישי'], ['💰', 'מרוויחים על כל ליד'], ['📊', 'מעקב מלא בזמן אמת'], ['🤝', 'פרופיל מלא = יותר אמון']] },
};
const TONES = ['bg-primary/10', 'bg-success/10', 'bg-warning/10', 'bg-accent'];

/** One merged post-signup welcome: benefits, partner terms (when needed) and profile CTA. */
export function PostSignupWelcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const consent = usePartnerConsent();
  const { acceptTerms, isAcceptingTerms } = useAffiliateLicense();
  const [role, setRole] = useState<SignupRole | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const celebrated = useRef<string | null>(null);
  const bonus = useQuery({ queryKey: ['my-signup-bonus', user?.id], enabled: !!user && !!role, queryFn: async () => {
    const { data, error } = await supabase.rpc('get_my_signup_bonus');
    if (error) throw error;
    return data as { credits: number } | null;
  } });
  useEffect(() => {
    if (!user) { setRole(null); return; }
    const check = () => setRole(readPostSignupWelcome());
    check();
    window.addEventListener(POST_SIGNUP_WELCOME_EVENT, check);
    return () => window.removeEventListener(POST_SIGNUP_WELCOME_EVENT, check);
  }, [user]);
  useEffect(() => {
    if (!user || !role) return;
    const key = `${user.id}:${role}`;
    if (celebrated.current === key) return;
    celebrated.current = key;
    // Run outside effect cleanup so role-query refreshes cannot truncate the seven seconds.
    celebrateSignup();
    void queryClient.invalidateQueries({ queryKey: ['credit-wallet'] });
  }, [role, user?.id, queryClient]);
  if (!user || !role) return null;
  const b = BENEFITS[role];
  const bonusNotice = bonus.data && Number(bonus.data.credits) > 0 ? <p role="status" className="relative flex items-center justify-center gap-2 py-3 text-center text-xl font-bold text-success"><Gift className="h-6 w-6 shrink-0" />בונוס הרשמה: {fmtCredits(Number(bonus.data.credits))} חינם!</p> : null;
  const needsTerms = role === 'partner' && consent.data !== true;
  const personal = ['partner', 'property_owner', 'property_seeker'].includes(role);
  const close = () => {
    clearPostSignupWelcome();
    setRole(null);
    void queryClient.invalidateQueries({ queryKey: ['partner-consent', user.id] });
  };
  const complete = async () => {
    setError('');
    if (needsTerms) {
      try {
        await acceptTerms();
        await queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) });
      } catch { setError('לא ניתן לשמור את האישור כרגע.'); return; }
    }
    if (role === 'partner') completePartnerIntro(user.id, true);
    close();
    navigate(personal ? '/profile?tab=personal' : '/profile?tab=workspace');
  };
  // Brokers get the dedicated brokers & agencies landing page inside their very
  // first welcome window, so they immediately see how the tool fits daily work.
  if (role === 'broker') {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent onInteractOutside={event => event.preventDefault()} dir="rtl" className="grid h-[92dvh] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 [&>button:last-child]:left-4 [&>button:last-child]:right-auto">
          <DialogHeader className="border-b px-5 py-4 text-right">
            <DialogTitle className="text-xl font-extrabold leading-tight">ברוכים הבאים! הנה הכלים שילוו אתכם בכל יום עבודה</DialogTitle>
            <DialogDescription className="text-sm">סיירו בדף המקצועי למתווכים וסוכנויות — ואז השלימו את הפרופיל כדי להתחיל.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <LandingContent />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t bg-background p-4">
            <div className="w-full">{bonusNotice}</div>
            <Button size="lg" className="flex-1 text-lg" onClick={() => void complete()}>השלמת פרופיל ✨</Button>
            <Button size="lg" variant="ghost" onClick={close}>אחר כך</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !isAcceptingTerms) close(); }}>
      <DialogContent onInteractOutside={event => event.preventDefault()} dir="rtl" className="w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto text-right">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/20 via-warning/10 to-transparent" />
        <DialogHeader className="relative text-center sm:text-center">
          <div className="text-5xl" aria-hidden>🎉</div>
           <DialogTitle className="text-3xl font-extrabold leading-tight border-0 after:hidden">{b.title}</DialogTitle>
          <DialogDescription className="sr-only">יתרונות החשבון והשלמת הפרופיל</DialogDescription>
        </DialogHeader>
        <ul className="relative grid gap-2.5">
          {b.items.map(([emoji, text], i) => (
               <li key={text} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-xl font-semibold ${TONES[i % TONES.length]}`}>
              <span className="text-2xl" aria-hidden>{emoji}</span>{text}
            </li>
          ))}
        </ul>
        {bonusNotice}
        {needsTerms && (
          <div className="flex items-start gap-2">
            <Checkbox id="welcome-partner-terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} disabled={isAcceptingTerms} />
            <Label htmlFor="welcome-partner-terms" className="text-sm leading-relaxed">מאשר/ת את <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">תקנון השותפים</a>. בלי פניות פיקטיביות.</Label>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="relative text-center text-lg leading-relaxed">השלימו פרטים אישיים ופרטי משרד או חברה, כדי לבנות אמון הדדי ברשת.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="flex-1 text-lg" disabled={(needsTerms && !agreed) || isAcceptingTerms} onClick={() => void complete()}>
            {isAcceptingTerms && <Loader2 className="h-4 w-4 animate-spin" />}השלמת פרופיל ✨
          </Button>
          <Button size="lg" variant="ghost" disabled={isAcceptingTerms} onClick={close}>אחר כך</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
