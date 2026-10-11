import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, ChartNoAxesCombined, Wallet, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { useAuth } from '@/hooks/useAuth';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { tutorialStore } from '@/lib/tutorials';

const slides = [
  { icon: Link, title: 'ברוכים הבאים לתוכנית השותפים', body: 'בחרו נכסים משותפים והעתיקו קישור אישי. שתפו בוואטסאפ, בהודעה או באימייל והביאו פניות אמיתיות.' },
  { icon: ChartNoAxesCombined, title: 'ריטה עובדת לצדכם', body: 'ריטה מסייעת במענה לפניות ובניהול התוכן גם כשאתם לא מחוברים. עקבו אחרי השיתופים והפניות במסך שלכם.' },
  { icon: Wallet, title: 'התגמולים שלכם', body: 'לכל נכס מוצגים התגמולים הזמינים לכם. בארנק תמצאו את התגמולים שהתקבלו ואת פירוט התנועות.' },
];

export function PartnerOnboarding({ onComplete, onCancel }: { onComplete: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const { acceptTerms, isAcceptingTerms } = useAffiliateLicense();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const slide = slides[step];
  const Icon = slide?.icon ?? ShieldCheck;
  const agree = async () => {
    setError('');
    try {
      await acceptTerms();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-consent', user?.id] }),
        queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user?.id) }),
        queryClient.invalidateQueries({ queryKey: ['affiliate-marketplace'] }),
      ]);
      tutorialStore.markSeen('page:/affiliate-network');
      onComplete();
    } catch { setError('לא ניתן לשמור את האישור כרגע. אפשר לנסות שוב.'); }
  };
  return <section dir="rtl" className="mx-auto w-full max-w-lg space-y-5 px-4 py-6 text-right" aria-label="הצטרפות לתוכנית השותפים">
    <Icon className="h-10 w-10 text-primary" aria-hidden />
    <h2 className="text-2xl font-extrabold">{slide?.title ?? 'אישור תקנון שותפים'}</h2>
    {slide ? <p className="text-lg leading-relaxed font-medium">{slide.body}</p> : <div className="space-y-4 text-lg leading-relaxed">
      <p><strong>שותפות באמצעות קישור אישי:</strong> פניות משויכות לשיתוף שלכם; הזכאות לתגמול נבדקת לפי התנאים שנקבעו לנכס.</p>
      <p><strong>התחייבות לפניות אמיתיות:</strong> אין להגיש פניות פיקטיביות, כפולות, אוטומטיות או עצמיות לצורך קבלת תגמול. יש לשמור על פרטיות ולקבל הסכמה למסירת פרטי קשר.</p>
      <p><strong>כללי התוכנית:</strong> השימוש כפוף לבדיקות אמינות, לתנאי הפרסום ולתקנון. אין הבטחה להכנסה.</p>
      <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">קריאת התקנון המלא</a>
      <p className="text-base text-muted-foreground">בלחיצה על ״אשר והסכם״ אני מאשר/ת שקראתי את התקנון ומסכים/ה לתנאיו.</p>
    </div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {slide ? <Button className="h-11 text-base font-bold" onClick={() => setStep(step + 1)}>הבא</Button> : <Button className="h-11 text-base font-bold" disabled={isAcceptingTerms} onClick={() => void agree()}>{isAcceptingTerms && <Loader2 className="h-4 w-4 animate-spin" />}אשר והסכם</Button>}
      {step > 0 && <Button variant="outline" disabled={isAcceptingTerms} onClick={() => setStep(step - 1)}>הקודם</Button>}
      {onCancel && <Button variant="ghost" disabled={isAcceptingTerms} onClick={onCancel}>ביטול</Button>}
    </div>
  </section>;
}