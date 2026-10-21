// Commission breakdown badges shown on every affiliate marketplace card.
//
// Levels 1-3 are digital marketing and lead-generation fees, open to every
// partner: a digital lead (name + phone), a WhatsApp screening chat, and a
// screened phone conversation. Level 4 is a deal-closing brokerage commission
// and stays locked until the partner's broker license is verified.
import { ClipboardList, Phone, Trophy } from 'lucide-react';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import type { CommissionTiers, RewardType } from '@/hooks/useAffiliate';
import { partnerNetReward } from '@/lib/affiliatePlans';
import { CLOSING_SPLIT_EXPLANATION } from './ClosingSplitNote';

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
  closingOnly = false,
}: {
  tiers: CommissionTiers;
  compact?: boolean;
  /** True for partners without a verified broker license (locks level 4). */
  level4Locked?: boolean;
  /** Show only the deal-closing commission (used by the public board column). */
  closingOnly?: boolean;
}) {
  const { level4Unlocked } = useAffiliateLicense();
  const showClosing = level4Unlocked && !level4Locked;
  const rows = [
    // Zero-value levels are hidden everywhere.
    { key: 'tier1', label: 'פנייה דיגיטלית', value: tierValue(tiers.tier1), icon: ClipboardList, tone: 'bg-warning/10 text-warning ring-warning/20', locked: false, show: tiers.tier1 > 0 },
    { key: 'tier2', label: 'סינון בווטסאפ', value: tierValue(tiers.tier2), icon: WhatsAppIcon, tone: 'bg-primary/10 text-primary ring-primary/20', locked: false, show: tiers.tier2 > 0 },
    { key: 'tier3', label: 'שיחת טלפון', value: tierValue(tiers.tier3), icon: Phone, tone: 'bg-accent text-accent-foreground ring-border', locked: false, show: tiers.tier3 > 0 },
    { key: 'tier4', label: 'סגירת עסקה', value: showClosing ? tierValue(tiers.tier4, tiers.tier4Type) : '', icon: Trophy, tone: 'bg-success/10 text-success ring-success/20', locked: false, show: tiers.tier4 > 0 && showClosing },
  ].filter((row) => row.show && (!closingOnly || row.key === 'tier4'));

  if (compact) {
    return (
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1 text-xs font-semibold text-success" data-commission-icons>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-1" title={r.key === 'tier4' ? CLOSING_SPLIT_EXPLANATION : r.label} aria-label={`${r.label}: ${r.value}${r.key === 'tier4' ? ' נטו לשותף, 80% מהעמלה; 20% דמי פלטפורמה ל־TORAFF' : ''}`}>
            <r.icon className="h-3 w-3" /><bdi dir="ltr">{r.value}{r.key === 'tier4' ? '*' : ''}</bdi>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {rows.map((r) => (
        <div key={r.key} title={r.key === 'tier4' ? CLOSING_SPLIT_EXPLANATION : undefined} className={`rounded-md px-2 py-1.5 ring-1 ${r.tone}`}>
          <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
            <r.icon className="h-3 w-3 shrink-0" />
            {r.label}
          </div>
          <div className={`truncate text-[11px] font-bold ${r.locked ? 'line-through' : ''}`}>
            <bdi dir="ltr">{r.value}{r.key === 'tier4' ? '*' : ''}</bdi>
          </div>
          {r.key === 'tier4' && <p className="mt-1 text-[10px] font-normal leading-relaxed">* נטו למתווך: 80% · TORAFF: 20%</p>}
        </div>
      ))}
    </div>
  );
}

export default CommissionTierBadges;
