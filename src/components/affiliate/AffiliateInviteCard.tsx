import { tagShareText, withShareUtm } from '@/lib/shareTracking';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Handshake, Link2, Mail, Wallet, RefreshCw } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'sonner';
import { useReferralProgram } from '@/hooks/useReferralProgram';
import { referralLink } from '@/lib/referralAttribution';
import { fmtCredits } from '@/lib/credits';
import { INVITE_BONUS_DEFAULTS, useInviteBonusSettings } from '@/hooks/useInviteBonusSettings';
import { usePersonalLanguage } from '@/i18n/personalLanguage';

const STEPS = [
  { icon: Link2, label: 'שולחים קישור', color: 'text-deal-blue', surface: 'bg-deal-blue/10' },
  { icon: Handshake, label: 'החבר סוגר עסקה', color: 'text-social-instagram', surface: 'bg-social-instagram/10' },
  { icon: Wallet, label: 'שניכם מרוויחים!', color: 'text-success', surface: 'bg-success/10' },
];

export function AffiliateInviteCard() {
  const { data, isLoading, isError, refetch } = useReferralProgram();
  // Fixed share bar sits 7px above the fixed auth footer (footer bottom edge is 10px above viewport bottom).
  const [barBottom, setBarBottom] = useState(38);
  useEffect(() => {
    const footer = document.querySelector('footer.auth-page-footer');
    if (!footer) return;
    const update = () => setBarBottom(10 + footer.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const bonus = useInviteBonusSettings().data ?? INVITE_BONUS_DEFAULTS;
  const { gender } = usePersonalLanguage();
  const referrerLabel = gender === 'female' ? 'לך · המזמינה' : 'לך · המזמין';
  const link = data?.code ? referralLink(data.code) : '';
  const message = `בואו ל־TORAFF! אחרי העסקה המאושרת הראשונה שלכם, תקבלו ${fmtCredits(bonus.friend_credits)} לארנק ואני אקבל ${fmtCredits(bonus.referrer_credits)}. מצטרפים דרך הקישור שלי: ${link}`;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(withShareUtm(link, 'copy'));
      toast.success('קישור ההזמנה הועתק');
    } catch {
      toast.error('לא ניתן להעתיק כרגע. נסו שוב.');
    }
  };
  const metrics = [
    { label: 'חברים שהצטרפו', value: String(data?.total ?? 0) },
    { label: 'בונוסים שאושרו', value: String(data?.verified_deals ?? 0) },
    { label: 'בונוס שנצבר בארנק', value: fmtCredits(data?.earned_ils ?? 0) },
  ];

  return (
    <section dir="rtl" data-no-hero-wave className="space-y-8 px-2 pt-6 sm:px-6 sm:pt-10">
      <header className="space-y-3 text-center">
        <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">קונים, מוכרים, מתווכים ושותפים. עסקה מאושרת אחת, בונוס לשניכם.</p>
      </header>
      <div className="grid grid-cols-3 gap-2 sm:gap-6">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className={`text-4xl font-extrabold leading-none sm:text-5xl ${step.color}`}>{i + 1}</span>
            <span className={`flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20 ${step.color} ${step.surface}`}>
              <step.icon className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="text-sm font-bold text-foreground sm:text-base">{step.label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 border-y border-border py-6 text-center">
        <div className="space-y-1 border-e border-border">
          <p className="text-sm text-muted-foreground">{referrerLabel}</p>
          <p className="text-4xl font-extrabold text-deal-blue"><bdi>{bonus.referrer_credits.toLocaleString('en-US')}</bdi></p>
          <p className="text-base">קרדיטים לארנק</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">לחבר · המוזמן</p>
          <p className="text-4xl font-extrabold text-success"><bdi>{bonus.friend_credits.toLocaleString('en-US')}</bdi></p>
          <p className="text-base">קרדיטים לארנק</p>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-center text-base leading-relaxed">הבונוס נכנס אוטומטית לשני הארנקים אחרי אישור העסקה הראשונה של החבר. הרשמה בלבד אינה מזכה בבונוס.</p>
        {isError && <div role="alert" className="text-center text-sm text-destructive">לא ניתן לטעון את ההזמנות כרגע. <Button variant="ghost" size="sm" onClick={() => void refetch()}><RefreshCw className="h-4 w-4" />נסה שוב</Button></div>}
      </div>
      {!!data?.total && <div className="grid grid-cols-3 gap-2 text-center">
        {metrics.map((m) => <div key={m.label} className="min-w-0 space-y-1"><p className="text-xl font-bold tabular-nums">{m.value}</p><p className="text-sm text-muted-foreground">{m.label}</p></div>)}
      </div>}
      <div aria-hidden="true" className="h-[63px]" />
      <div className="fixed inset-x-0 z-20 border-t border-border bg-background" style={{ bottom: `${barBottom}px` }}>
        <div className="mx-auto w-full max-w-2xl px-2 pt-3 pb-[7px] sm:px-6">
          <div className="grid grid-cols-3 gap-3">
            <Button className="gap-2 px-2" size="lg" disabled={!link} onClick={() => void copy()} aria-label="העתק קישור אישי"><Copy className="h-5 w-5 shrink-0" /><span className="truncate">העתק קישור</span></Button>
            <Button variant="outline" className="gap-2 px-2" disabled={!link} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(tagShareText(message, 'whatsapp'))}`, '_blank', 'noopener,noreferrer')}><FaWhatsapp className="h-5 w-5 shrink-0 text-social-whatsapp" />וואטסאפ</Button>
            <Button variant="outline" className="gap-2 px-2" disabled={!link} onClick={() => window.open(`mailto:?subject=${encodeURIComponent('הזמנה ל־TORAFF · בונוס כפול')}&body=${encodeURIComponent(tagShareText(message, 'email'))}`, '_blank', 'noopener,noreferrer')}><Mail className="h-5 w-5 shrink-0 text-social-email" />אימייל</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
export default AffiliateInviteCard;
