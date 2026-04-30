import { ArrowUpRight, Check, Mic, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UpgradePlanModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentTarget: number;
  newTarget: number;
  unitLabel: string;
  unitsLabel: string;
  audienceLabel: string;
  currentReach: number;
  projectedReach: number;
  currentMinutes: number;
  projectedMinutes: number;
  currentPool: number;
  projectedPool: number;
  isDowngrade?: boolean;
  /** Switches headline + persuasion copy to primaries voice. */
  isPrimaries?: boolean;
  /** % uplift in audience reach over the user's current plan. */
  upliftPercent?: number;
}

const fmt = (n: number) => new Intl.NumberFormat('he-IL').format(Math.max(0, Math.round(n)));

const ADVANTAGES_NATIONAL = [
  { icon: Zap, title: 'תוצאות מהירות יותר', desc: 'יותר דקות AI - יותר שיחות בו-זמנית, פחות זמן עד תוצאה.' },
  { icon: Users, title: 'חדירה עמוקה לשטח', desc: 'מאגר לידים גדול יותר ויכולת מיקוד מדויקת יותר לכל אזור.' },
  { icon: ShieldCheck, title: 'עדיפות בעיבוד AI', desc: 'התוכן והמסרים שלך יקבלו עדיפות עליונה בתורי המערכת.' },
];

const ADVANTAGES_PRIMARIES = [
  { icon: Zap, title: 'מובילים את הצמרת', desc: 'יותר נקודות מגע אישיות עם פעילי הסניפים שמכריעים את הדירוג.' },
  { icon: Users, title: 'תומכים מזוהים נוספים', desc: 'הרחבת מאגר התומכים המאומתים ומיקוד עומק לכל סניף.' },
  { icon: ShieldCheck, title: 'מנגנון מענה מהיר', desc: 'עדיפות עליונה ל-AI לטיפול בפניות ובשיחות פנים-מפלגתיות.' },
];

export function UpgradePlanModal({
  open,
  onOpenChange,
  currentTarget,
  newTarget,
  unitLabel,
  unitsLabel,
  audienceLabel,
  currentReach,
  projectedReach,
  currentMinutes,
  projectedMinutes,
  currentPool,
  projectedPool,
  isDowngrade = false,
  isPrimaries = false,
  upliftPercent = 0,
}: UpgradePlanModalProps) {
  const navigate = useNavigate();

  const handlePrimary = () => {
    onOpenChange(false);
    navigate('/subscription');
  };

  const advantages = isPrimaries ? ADVANTAGES_PRIMARIES : ADVANTAGES_NATIONAL;
  const headline = isDowngrade
    ? 'התאמת חבילה למטה'
    : isPrimaries
      ? 'רוצה להבטיח את המקום שלך בצמרת הרשימה?'
      : 'שדרג את הקמפיין שלך';

  const safeUplift = Math.max(0, Math.round(upliftPercent));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="premium-auth-modal sm:max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5 text-gold" />
            {headline}
          </DialogTitle>
          <DialogDescription>
            {isDowngrade ? (
              'הקטנת היעד דורשת תיאום עם מומחה כדי להתאים מכסות וחיובים בהתאם.'
            ) : isPrimaries ? (
              <>
                שדרוג יעד המושבים מ-<span className="font-bold text-foreground">{currentTarget}</span>{' '}
                ל-<span className="font-bold text-foreground">{newTarget}</span> יגדיל את כמות הפעילים והתומכים המזוהים שלך{' '}
                {safeUplift > 0 ? (
                  <>ב-<span className="font-bold text-gold">{safeUplift}%</span>.</>
                ) : (
                  <>באופן מיידי.</>
                )}
              </>
            ) : (
              <>
                שדרוג מ-<span className="font-bold text-foreground">{currentTarget} {unitsLabel}</span>{' '}
                ליעד של <span className="font-bold text-foreground">{newTarget} {unitsLabel}</span>{' '}
                {safeUplift > 0 ? (
                  <>פותח <span className="font-bold text-gold">+{safeUplift}%</span> {audienceLabel}.</>
                ) : (
                  <>פותח עוצמה אמיתית.</>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Comparison table */}
        <div className="mt-2 overflow-hidden rounded-xl border border-primary/15">
          <div className="grid grid-cols-3 bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
            <span>מדד</span>
            <span className="text-center">מצב נוכחי</span>
            <span className="text-center text-gold">לאחר שדרוג</span>
          </div>
          <Row
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={`יעד ${unitsLabel}`}
            current={`${currentTarget} ${unitLabel}`}
            next={`${newTarget} ${unitLabel}`}
            highlight
          />
          <Row
            icon={<Users className="h-3.5 w-3.5" />}
            label={audienceLabel}
            current={fmt(currentReach)}
            next={fmt(projectedReach)}
          />
          <Row
            icon={<Mic className="h-3.5 w-3.5" />}
            label="דקות AI Voice"
            current={fmt(currentMinutes)}
            next={fmt(projectedMinutes)}
          />
          <Row
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="מאגר פעיל"
            current={fmt(currentPool)}
            next={fmt(projectedPool)}
          />
        </div>

        {/* Advantages */}
        {!isDowngrade && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {advantages.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-gold/30 bg-gold/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <h4 className="text-[17px] font-bold text-primary">{title}</h4>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            לא עכשיו
          </Button>
          <Button
            onClick={handlePrimary}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
          >
            <ArrowUpRight className="ms-1 h-4 w-4" />
            {isDowngrade ? 'דבר עם איש אסטרטגיה' : 'שדרג עכשיו / דבר עם אסטרטג'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  current,
  next,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  current: string;
  next: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 items-center border-t border-primary/10 bg-card px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary/60">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-center font-semibold text-foreground/80">{current}</div>
      <div className={`text-center font-bold tabular-nums ${highlight ? 'text-primary' : 'text-gold'}`}>
        <span className="inline-flex items-center gap-1">
          <Check className="h-3.5 w-3.5 opacity-70" />
          {next}
        </span>
      </div>
    </div>
  );
}
