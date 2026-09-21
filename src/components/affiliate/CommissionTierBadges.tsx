// Commission breakdown badges shown on every affiliate marketplace card.
//
// Levels 1-3 are digital marketing and lead-generation fees, open to every
// partner: a digital lead (name + phone), a WhatsApp screening chat, and a
// screened phone conversation. Level 4 is a deal-closing brokerage commission
// and stays locked until the partner's broker license is verified.
import { CheckCircle2, ClipboardList, Lock, Phone, Trophy } from 'lucide-react';
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
  level4Locked = false,
}: {
  tiers: CommissionTiers;
  compact?: boolean;
  /** True for partners without a verified broker license (locks level 4). */
  level4Locked?: boolean;
}) {
  const rows = [
    // Zero-value levels are hidden everywhere.
    { key: 'tier1', label: 'ליד דיגיטלי', value: tierValue(tiers.tier1), icon: ClipboardList, tone: 'bg-amber-50 text-amber-800 ring-amber-100', locked: false, show: tiers.tier1 > 0 },
    { key: 'tier2', label: 'סינון בווטסאפ', value: tierValue(tiers.tier2), icon: CheckCircle2, tone: 'bg-sky-50 text-sky-800 ring-sky-100', locked: false, show: tiers.tier2 > 0 },
    { key: 'tier3', label: 'שיחת טלפון', value: tierValue(tiers.tier3), icon: Phone, tone: 'bg-indigo-50 text-indigo-800 ring-indigo-100', locked: false, show: tiers.tier3 > 0 },
    { key: 'tier4', label: level4Locked ? 'סגירת עסקה · נדרש רישיון' : 'סגירת עסקה', value: tierValue(tiers.tier4, tiers.tier4Type), icon: level4Locked ? Lock : Trophy, tone: level4Locked ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-100', locked: level4Locked, show: tiers.tier4 > 0 },
  ].filter((row) => row.show);

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
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
