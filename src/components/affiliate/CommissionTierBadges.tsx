// Commission breakdown badges shown on every affiliate marketplace card.
//
// Levels 1 and 2 are digital marketing and lead-generation fees, open to every
// partner. Level 3 is a deal-closing brokerage commission and is shown locked
// until the partner's broker license is verified.
import { CheckCircle2, Flame, Lock, Trophy } from 'lucide-react';
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
  tier3Locked = false,
}: {
  tiers: CommissionTiers;
  compact?: boolean;
  /** True for partners without a verified broker license. */
  tier3Locked?: boolean;
}) {
  const rows = [
    { key: 'tier1', label: 'טופס דיגיטלי', value: tierValue(tiers.tier1), icon: Flame, tone: 'bg-amber-50 text-amber-800 ring-amber-100', locked: false },
    { key: 'tier2', label: 'שיחה מאומתת', value: tierValue(tiers.tier2), icon: CheckCircle2, tone: 'bg-sky-50 text-sky-800 ring-sky-100', locked: false },
    { key: 'tier3', label: tier3Locked ? 'נדרש רישיון תיווך' : 'סגירת עסקה', value: tierValue(tiers.tier3, tiers.tier3Type), icon: tier3Locked ? Lock : Trophy, tone: tier3Locked ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-100', locked: tier3Locked },
  ].filter((row) => row.key === 'tier3' ? tiers.tier3 > 0 : row.key === 'tier2' ? tiers.tier2 > 0 : tiers.tier1 > 0);

  if (compact) {
    return (
      <div className="space-y-0.5 text-[11px] font-semibold text-success">
        {rows.map((r) => (
          <div key={r.key} className={`flex items-center gap-1 ${r.locked ? 'text-slate-400 line-through' : ''}`} title={r.label}>
            <r.icon className="h-3 w-3" /><bdi dir="ltr">{r.value}</bdi>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {rows.map((r) => (
        <div key={r.key} className={`rounded-md px-2 py-1.5 ring-1 ${r.tone}`}>
          <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
            <r.icon className="h-3 w-3 shrink-0" />
            {r.label}
          </div>
          <div className={`truncate text-[11px] font-bold ${r.locked ? 'line-through' : ''}`}>
            <bdi dir="ltr">{r.value}</bdi>
          </div>
        </div>
      ))}
    </div>
  );
}

export default CommissionTierBadges;
