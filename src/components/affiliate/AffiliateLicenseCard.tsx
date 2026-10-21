// License verification panel in the partner portal.
//
// Compliance rule: a partner without a verified broker license earns marketing
// and lead-generation fees (levels 1-3) only. Level 4, the deal-closing
// commission, unlocks strictly after a valid license is submitted and verified.
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import AffiliateEligibilityBadge from '@/components/affiliate/AffiliateEligibilityBadge';
import { formatIsoDate } from '@/lib/listingDates';
import { brokerLicenseDigits, brokerLicenseSchema, INVALID_BROKER_LICENSE } from '@/lib/brokerLicense';

export function AffiliateLicenseCard() {
  const { license, isLoading, level4Unlocked, submit, isSubmitting } = useAffiliateLicense();
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');

  useEffect(() => {
    setNumber(license.licenseNumber);
    setHolder(license.holderName);
  }, [license.licenseNumber, license.holderName]);

  const save = async () => {
    try {
      await submit({ licenseNumber: number, holderName: holder });
      toast.success('הרישיון אומת מול פנקס המתווכים המורשים');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message || INVALID_BROKER_LICENSE);
    }
  };

  return (
    <Card dir="rtl" className="border-border/60">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            אימות רישיון
          </div>
          <AffiliateEligibilityBadge status={license.status} />
        </div>

        {level4Unlocked ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-[12px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            רישיון {license.licenseNumber} אומת ב{formatIsoDate(license.verifiedAt) ?? '—'}.
          </div>
        ) : (
          <div className="space-y-3">
            {license.status === 'pending' ? (
              <div className="rounded-xl bg-amber-50 p-3 text-[12px] font-semibold text-amber-800 ring-1 ring-amber-200">
                הרישיון הוגש ב{formatIsoDate(license.submittedAt) ?? '—'} ונמצא בבדיקה.
              </div>
            ) : null}
            {license.status === 'rejected' ? (
              <div className="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-800 ring-1 ring-rose-200">
                הרישיון נדחה{license.rejectionReason ? `: ${license.rejectionReason}` : ''}. אפשר לעדכן ולשלוח שוב.
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="affiliate-license-number">מספר רישיון תיווך</Label>
                <Input
                  id="affiliate-license-number"
                  value={number}
                  onChange={(e) => setNumber(brokerLicenseDigits(e.target.value))}
                  maxLength={10}
                  pattern="[1-9][0-9]{0,9}"
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="affiliate-license-holder">שם בעל הרישיון</Label>
                <Input
                  id="affiliate-license-holder"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                />
              </div>
            </div>
            <Button className="w-full sm:w-auto" disabled={isLoading || isSubmitting || !brokerLicenseSchema.safeParse(number).success} onClick={() => void save()}>
              {isSubmitting ? 'שולח...' : 'שליחת רישיון לאימות'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AffiliateLicenseCard;
