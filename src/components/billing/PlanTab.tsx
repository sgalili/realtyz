import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { CreditBalancePill } from '@/components/CreditBalancePill';
import { PACKAGES, limitLabel, type PricingPackage } from '@/lib/pricing';
import { fmtILS } from '@/lib/formatCurrency';
import { useSubscription, type PlanName } from '@/hooks/useSubscription';
import { LaunchPromoBanner } from '@/components/billing/LaunchPromoBanner';
import { ReferralProgramCard } from '@/components/referrals/ReferralProgramCard';
import { cn } from '@/lib/utils';

export default function PlanTab() {
  const { status, subscribe } = useSubscription();
  const currentPlan = (status?.plan ?? 'free') as PlanName;
  const promoAvailable = !!status && (status.is_launch_promo || status.promo_remaining > 0);

  const priceFor = (pkg: PricingPackage) =>
    promoAvailable && pkg.monthlyPrice > 0 ? pkg.monthlyPrice / 2 : pkg.monthlyPrice;

  return (
    <div className="space-y-4 mt-5">
      <LaunchPromoBanner />

      <div dir="rtl" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ארנק קרדיטים</p>
          <p className="text-sm text-foreground">
            יתרה לשירותי פרימיום (SMS, WhatsApp, שיחות AI)
            {status && (
              <span className="ms-2 text-muted-foreground">
                · <bdi dir="ltr">₪{Math.round(status.wallet_balance_ils).toLocaleString('he-IL')}</bdi>
              </span>
            )}
          </p>
        </div>
        <CreditBalancePill />
      </div>

      <div dir="rtl" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKAGES.map((pkg) => {
          const isCurrent = pkg.id === currentPlan || (pkg.id === 'basic' && currentPlan === 'agent');
          const planName: PlanName = pkg.id === 'basic' ? 'agent' : pkg.id === 'agency' ? 'max' : (pkg.id as PlanName);
          const discounted = priceFor(pkg);
          return (
            <Card key={pkg.id} className={cn('flex h-full flex-col', isCurrent && 'border-2 border-primary shadow-md')}>
              <CardContent className="flex h-full flex-col gap-4 pt-6 text-right">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{pkg.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                        החבילה שלך
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{pkg.tagline}</p>
                </div>

                <div>
                  <span className="text-3xl font-bold tabular-nums text-primary">
                    <bdi dir="ltr">{discounted === 0 ? '₪0' : fmtILS(discounted)}</bdi>
                  </span>
                  <span className="ms-1 text-xs text-muted-foreground">/ חודש</span>
                  {discounted !== pkg.monthlyPrice && (
                    <span className="ms-2 text-xs text-muted-foreground line-through">
                      <bdi dir="ltr">{fmtILS(pkg.monthlyPrice)}</bdi>
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{limitLabel(pkg.contacts)} אנשי קשר</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{limitLabel(pkg.properties)} נכסים</span>
                  </li>
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => subscribe.mutate(planName)}
                  variant={pkg.highlight ? 'default' : 'outline'}
                  className="mt-auto w-full"
                  disabled={isCurrent || subscribe.isPending}
                >
                  {isCurrent ? 'המסלול הנוכחי' : pkg.id === 'free' ? 'מעבר לחינם' : `שדרוג ל${pkg.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {status && (
        <p dir="rtl" className="text-xs text-muted-foreground">
          השימוש הנוכחי: {status.contacts_used.toLocaleString('he-IL')} מתוך {status.contact_limit.toLocaleString('he-IL')} אנשי קשר בחבילה.
          כל החבילות בתשלום כוללות את אותן יכולות; ההבדל היחיד הוא מספר אנשי הקשר הפעילים.
        </p>
      )}

      <ReferralProgramCard />
    </div>
  );
}
