import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Handshake, Link2, Mail, Wallet, RefreshCw } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'sonner';
import { useReferralProgram } from '@/hooks/useReferralProgram';
import { referralLink } from '@/lib/referralAttribution';
import { fmtILS } from '@/lib/formatCurrency';

const STEPS = [
  { icon: Link2, label: 'שולחים קישור', color: 'text-deal-blue', surface: 'bg-deal-blue/10' },
  { icon: Handshake, label: 'החבר סוגר עסקה', color: 'text-social-instagram', surface: 'bg-social-instagram/10' },
  { icon: Wallet, label: 'שניכם מרוויחים!', color: 'text-success', surface: 'bg-success/10' },
];

export function AffiliateInviteCard() {
  const { data, isLoading, isError, refetch } = useReferralProgram();
  const link = data?.code ? referralLink(data.code) : '';
  const message = `בואו ל־Realtyz! אחרי העסקה המאושרת הראשונה שלכם, תקבלו ₪100 לארנק ואני אקבל ₪200. מצטרפים דרך הקישור שלי: ${link}`;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('קישור ההזמנה הועתק');
    } catch {
      toast.error('לא ניתן להעתיק כרגע. אפשר לבחור ולהעתיק את הקישור שמופיע כאן.');
    }
  };
  const metrics = [
    { label: 'חברים שהצטרפו', value: String(data?.total ?? 0) },
    { label: 'בונוסים שאושרו', value: String(data?.verified_deals ?? 0) },
    { label: 'בונוס שנצבר בארנק', value: fmtILS(data?.earned_ils ?? 0) },
  ];

  return (
    <section dir="rtl" data-no-hero-wave className="space-y-8 px-2 py-6 sm:px-6 sm:py-10">
      <header className="space-y-3 text-center">
        <p className="text-sm font-bold text-success">Realtyz · בונוס כפול</p>
        <h1 className="text-3xl font-bold text-foreground">הזמן חברים</h1>
        <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">קונים, מוכרים, מתווכים ושותפים. עסקה מאושרת אחת, בונוס לשניכם.</p>
      </header>
      <div className="grid grid-cols-3 gap-2 sm:gap-6">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex min-w-0 flex-col items-center gap-3 text-center">
            <span className={`flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20 ${step.color} ${step.surface}`}>
              <step.icon className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="text-sm font-bold text-foreground sm:text-base">{step.label}</span>
            <span className="text-xs text-muted-foreground">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 border-y border-border py-6 text-center">
        <div className="space-y-1 border-e border-border">
          <p className="text-sm text-muted-foreground">לכם · המזמין</p>
          <p className="text-4xl font-extrabold text-deal-blue"><bdi>₪200</bdi></p>
          <p className="text-sm">זיכוי לארנק</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">לחבר · המוזמן</p>
          <p className="text-4xl font-extrabold text-success"><bdi>₪100</bdi></p>
          <p className="text-sm">בונוס לארנק</p>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-center text-base leading-relaxed">הבונוס נכנס אוטומטית לשני הארנקים אחרי אישור העסקה הראשונה של החבר. הרשמה בלבד אינה מזכה בבונוס.</p>
        {isError && <div role="alert" className="text-center text-sm text-destructive">לא ניתן לטעון את ההזמנות כרגע. <Button variant="ghost" size="sm" onClick={() => void refetch()}><RefreshCw className="h-4 w-4" />נסה שוב</Button></div>}
        <Input readOnly value={isLoading ? 'טוען…' : link || 'לא נוצר קישור'} className="bg-muted/30 text-center font-mono text-xs" dir="ltr" aria-label="קישור ההזמנה האישי" onFocus={(e) => e.currentTarget.select()} />
        <Button className="w-full gap-2" size="lg" disabled={!link} onClick={() => void copy()}><Copy className="h-5 w-5" />העתק קישור אישי</Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="gap-2" disabled={!link} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}><FaWhatsapp className="h-5 w-5 text-social-whatsapp" />וואטסאפ</Button>
          <Button variant="outline" className="gap-2" disabled={!link} onClick={() => window.open(`mailto:?subject=${encodeURIComponent('הזמנה ל־Realtyz · בונוס כפול')}&body=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}><Mail className="h-5 w-5 text-social-email" />אימייל</Button>
        </div>
      </div>
      {!!data?.total && <div className="grid grid-cols-3 gap-2 text-center">
        {metrics.map((m) => <div key={m.label} className="min-w-0 space-y-1"><p className="text-xl font-bold tabular-nums">{m.value}</p><p className="text-sm text-muted-foreground">{m.label}</p></div>)}
      </div>}
    </section>
  );
}
export default AffiliateInviteCard;
