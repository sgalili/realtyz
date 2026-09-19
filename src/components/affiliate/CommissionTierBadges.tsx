// Commission breakdown badges shown on every affiliate marketplace card.
//
// Always three tiers, in funnel order, so an affiliate can compare properties
// at a glance without opening a dialog.
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Flame, Trophy } from 'lucide-react';
import type { CommissionTiers, RewardType } from '@/hooks/useAffiliate';
import { partnerNetReward } from '@/lib/affiliatePlans';

function money(amount: number): string {
  return `₪${Number(amount || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

function tierValue(amount: number, type: RewardType = 'fixed'): string {
  return type === 'percent' ? `${partnerNetReward(amount)}%` : money(partnerNetReward(amount));
}

export function CommissionTierBadges({
  tiers,
  compact = false,
}: {
  tiers: CommissionTiers;
  compact?: boolean;
}) {
  const rows = [
    { key: 'tier1', label: 'ליד חם שהוגש', value: tierValue(tiers.tier1), icon: Flame, tone: 'bg-amber-50 text-amber-800 ring-amber-100' },
    { key: 'tier2', label: 'ליד שאומת', value: tierValue(tiers.tier2), icon: CheckCircle2, tone: 'bg-sky-50 text-sky-800 ring-sky-100' },
    { key: 'tier3', label: 'סגירת עסקה', value: tierValue(tiers.tier3, tiers.tier3Type), icon: Trophy, tone: 'bg-emerald-50 text-emerald-800 ring-emerald-100' },
  ].filter((row) => row.key === 'tier3' ? tiers.tier3 > 0 : row.key === 'tier2' ? tiers.tier2 > 0 : tiers.tier1 > 0);

  if (compact) {
    return (
      <div className="space-y-0.5 text-[11px] font-semibold text-success">
        {rows.map((r, i) => (
          <div key={r.key}>{i + 1}: <bdi dir="ltr">{r.value}</bdi></div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {rows.map((r, i) => (
        <div key={r.key} className={`rounded-md px-2 py-1.5 ring-1 ${r.tone}`}>
          <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
            <r.icon className="h-3 w-3 shrink-0" />
            שלב {i + 1}
          </div>
          <div className="truncate text-[11px] font-bold">
            <bdi dir="ltr">{r.value}</bdi>
          </div>
          <div className="truncate text-[10px] opacity-70">{r.label}</div>
        </div>
      ))}
    </div>
  );
}

export default CommissionTierBadges;
