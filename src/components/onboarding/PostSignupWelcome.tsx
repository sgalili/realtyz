import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { completePartnerIntro } from '@/lib/partnerIntroPreference';
import { readPostSignupWelcome, clearPostSignupWelcome, type SignupRole } from '@/lib/signupRole';
import { LandingContent } from '@/pages/Landing';

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
  useEffect(() => {
    if (!user) return;
    const check = () => setRole(readPostSignupWelcome());
    check();
    const t = window.setTimeout(check, 1500);
    return () => window.clearTimeout(t);
  }, [user]);
  if (!user || !role) return null;
  const b = BENEFITS[role];
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
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !isAcceptingTerms) close(); }}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto text-right">
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
