// RealtyZ Partner Network panel — a short, visual, mobile-first invite screen
// dedicated ONLY to inviting licensed brokers to the RealtyZ software.
// No property / lead terminology here on purpose.
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Gift, Link2, MessageCircle, MessageSquare, Share2, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useReferralProgram } from '@/hooks/useReferralProgram';
import { referralLink } from '@/lib/referralAttribution';
import { fmtILS } from '@/lib/formatCurrency';

const STEPS = [
  { icon: Link2, label: 'משתפים קישור' },
  { icon: UserPlus, label: 'מתווך מצטרף' },
  { icon: Wallet, label: 'אתם מרוויחים' },
];

export function AffiliateInviteCard() {
  const { data, isLoading } = useReferralProgram();
  const code = data?.code ?? '';
  const link = code ? referralLink(code) : '';

  const invites = data?.total ?? 0;
  const signups = (data?.registered_free ?? 0) + (data?.converted_paid ?? 0);
  const activeSubs = data?.converted_paid ?? 0;
  const earnings = data?.earned_ils ?? 0;

  const message = `היי, אני עובד עם RealtyZ – מערכת ה-AI לסוכני נדל״ן. מצטרפים דרך הקישור שלי: ${link}`;

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success('קישור ההזמנה הועתק');
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'רשת השותפים של RealtyZ', text: message, url: link });
        return;
      } catch { /* user cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const metrics = [
    { label: 'הזמנות', value: String(invites) },
    { label: 'נרשמים', value: String(signups) },
    { label: 'מנויים פעילים', value: String(activeSubs) },
    { label: 'הכנסות מהשותפים', value: fmtILS(earnings) },
  ];

  return (
    <Card dir="rtl" className="border-border/60">
      <CardContent className="space-y-5 p-4 sm:p-6">
        {/* Header */}
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">רשת השותפים של RealtyZ</h1>
          <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted-foreground">
            מזמינים מתווכים ל RealtyZ ומרוויחים על כל מנוי שמצטרף דרך הקישור האישי שלכם.
          </p>
        </header>

        {/* 3 visual steps */}
        <div className="grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2 py-3 text-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold text-foreground sm:text-[13px]">{s.label}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
            </div>
          ))}
        </div>

        {/* Reward tiers */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <Gift className="h-4 w-4" /> מה מקבלים
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-card p-3 text-center shadow-sm">
              <div className="text-lg font-extrabold tabular-nums text-foreground">₪0</div>
              <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">הרשמה חינם</div>
            </div>
            <div className="rounded-xl bg-card p-3 text-center shadow-sm ring-1 ring-primary/30">
              <div className="text-lg font-extrabold tabular-nums text-primary">₪50</div>
              <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">על כל מנוי בתשלום</div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            הקרדיט נכנס אוטומטית לארנק שלכם ברגע שהמתווך משדרג לחבילה בתשלום.
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
              <div className="text-base font-extrabold tabular-nums text-foreground sm:text-lg">
                {isLoading ? '—' : m.value}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Link + CTAs */}
        <div className="space-y-2">
          <Input
            readOnly
            value={isLoading ? 'טוען…' : link || 'לא נוצר קישור'}
            className="bg-muted/30 text-center font-mono text-xs"
            dir="ltr"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button className="w-full" size="lg" disabled={!link} onClick={() => void copy()}>
            <Copy className="me-2 h-4 w-4" /> העתקת קישור ההזמנה
          </Button>
          <Button className="w-full" size="lg" variant="outline" disabled={!link} onClick={() => void share()}>
            <Share2 className="me-2 h-4 w-4" /> שיתוף הקישור
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant="ghost"
              disabled={!link}
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}
            >
              <MessageCircle className="me-1.5 h-4 w-4" /> וואטסאפ
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="ghost"
              disabled={!link}
              onClick={() => window.open(`sms:?&body=${encodeURIComponent(message)}`, '_self')}
            >
              <MessageSquare className="me-1.5 h-4 w-4" /> SMS
            </Button>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> כל מי שנרשם דרך הקישור משויך אליכם לצמיתות.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AffiliateInviteCard;
