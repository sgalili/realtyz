import { useState } from 'react';
import { EyeOff, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AffiliateCommissionButton } from '@/components/properties/AffiliateCommissionButton';
import { useSetAffiliateReward, type AffiliateConfigRow, type RewardType } from '@/hooks/useAffiliate';

const money = (n: number) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

/**
 * Unified partner column for property tables: one icon button (green when the
 * property is open for partner marketing), a guarded remove-from-marketing
 * button, and the per-stage rewards as plain text underneath. Zero amounts are
 * hidden — no pills, no text labels.
 */
export function AffiliateShareCell({ listingId, config }: { listingId: string; config?: AffiliateConfigRow }) {
  const shared = Boolean(config?.affiliate_enabled);
  const setReward = useSetAffiliateReward();
  const [confirming, setConfirming] = useState(false);

  const tiers: string[] = [];
  if (shared && config) {
    const t1 = Number(config.affiliate_tier1_amount ?? 0);
    const t2 = Number(config.affiliate_tier2_amount ?? 0);
    const t3 = Number(config.affiliate_tier3_amount ?? 0);
    if (t1) tiers.push(`1: ${money(t1)}`);
    if (t2) tiers.push(`2: ${money(t2)}`);
    if (t3) tiers.push(`3: ${config.affiliate_tier3_type === 'percent' ? `${t3}%` : money(t3)}`);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="inline-flex items-center gap-1">
        <AffiliateCommissionButton listingId={listingId} shared={shared} />
        {shared ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            title="הפסקת שיווק ע״י שותפים"
            aria-label="הפסקת שיווק ע״י שותפים"
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {tiers.length > 0 ? (
        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-600">
          <bdi dir="ltr">{tiers.join(', ')}</bdi>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">להפסיק שיווק ע״י שותפים?</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              הנכס ייעלם מרשימת הנכסים לשיווק של כל השותפים. התגמולים שהוגדרו יישמרו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await setReward.mutateAsync({
                    listingId,
                    enabled: false,
                    rewardType: 'fixed' as RewardType,
                    rewardAmount: 0,
                    tier1Amount: Number(config?.affiliate_tier1_amount ?? 0),
                    tier2Amount: Number(config?.affiliate_tier2_amount ?? 0),
                    tier3Type: (config?.affiliate_tier3_type ?? 'fixed') as RewardType,
                    tier3Amount: Number(config?.affiliate_tier3_amount ?? 0),
                  });
                  toast.success('הנכס הוסר משיווק שותפים');
                } catch {
                  toast.error('ההסרה נכשלה');
                }
              }}
            >
              הסרה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { Handshake };
