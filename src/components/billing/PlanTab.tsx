import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { CreditBalancePill } from '@/components/CreditBalancePill';
import { PACKAGES, limitLabel, recommendedPackage, type PricingPackage } from '@/lib/pricing';
import { fmtILS } from '@/lib/formatCurrency';
import { useFreemiumStatus } from '@/hooks/useFreemiumStatus';
import { cn } from '@/lib/utils';

const SALES_PHONE = '972546811841';

export default function PlanTab() {
  const { contactsUsed, propertiesUsed } = useFreemiumStatus();
  const recommended = useMemo(
    () => recommendedPackage(contactsUsed, propertiesUsed),
    [contactsUsed, propertiesUsed],
  );

  const requestUpgrade = (pkg: PricingPackage) => {
    const text = `היי, אני רוצה לשדרג את ריאלטיז לחבילת ${pkg.name} (${fmtILS(pkg.monthlyPrice)} לחודש).`;
    window.open(`https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4 mt-5">
      <div dir="rtl" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ארנק קמפיינים</p>
          <p className="text-sm text-foreground">יתרת קרדיטים לשירותי פרימיום (SMS, WhatsApp, שיחות AI)</p>
        </div>
        <CreditBalancePill />
      </div>

      <div dir="rtl" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKAGES.map((pkg) => (
          <Card
            key={pkg.id}
            className={cn(
              'flex h-full flex-col',
              pkg.id === recommended.id && 'border-2 border-primary shadow-md',
            )}
          >
            <CardContent className="flex h-full flex-col gap-4 pt-6 text-right">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">{pkg.name}</h3>
                  {pkg.id === recommended.id && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      מומלץ לך
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{pkg.tagline}</p>
              </div>

              <div>
                <span className="text-3xl font-bold tabular-nums text-primary">
                  <bdi dir="ltr">{pkg.monthlyPrice === 0 ? '₪0' : fmtILS(pkg.monthlyPrice)}</bdi>
                </span>
                <span className="ms-1 text-xs text-muted-foreground">/ חודש</span>
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
                {/* seats removed — pricing is per contacts only */}

                {pkg.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => requestUpgrade(pkg)}
                variant={pkg.highlight ? 'default' : 'outline'}
                className="mt-auto w-full"
                disabled={pkg.id === 'free'}
              >
                {pkg.id === 'free' ? 'המסלול הנוכחי' : `שדרוג ל${pkg.name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p dir="rtl" className="text-xs text-muted-foreground">
        השימוש הנוכחי שלכם: {contactsUsed.toLocaleString('he-IL')} אנשי קשר · {propertiesUsed.toLocaleString('he-IL')} נכסים.
        שיטת החישוב: מחיר חבילה חודשי קבוע + ארנק קרדיטים לשירותים בצריכה בפועל (SMS, הודעות WhatsApp בתשלום, IVR ושיחות AI קוליות).
      </p>
    </div>
  );
}
