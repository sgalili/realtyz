import { ClipboardList, Phone, Trophy } from 'lucide-react';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import type { CommissionTiers } from '@/hooks/useAffiliate';

export type RewardTypes = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
const rewardIcons = [
  { key: 'form', label: 'שדות בטופס דף נחיתה', Icon: ClipboardList, tone: 'text-warning' },
  { key: 'whatsapp', label: 'סינון בווטסאפ', Icon: WhatsAppIcon, tone: 'text-primary' },
  { key: 'phone', label: 'שיחת טלפון', Icon: Phone, tone: 'text-muted-foreground' },
  { key: 'closing', label: 'סגירת עסקה', Icon: Trophy, tone: 'text-success' },
] as const;

export function RewardIcons({ types }: { types: RewardTypes }) {
  const rows = rewardIcons.filter(row => types[row.key] === true);
  if (!rows.length) return null;
  return <span className="inline-flex flex-col gap-1 text-start" data-commission-icons>
    <span className="text-[10px] font-medium text-muted-foreground">תגמולים</span>
    <span className="flex items-center gap-2">{rows.map(({ key, label, Icon, tone }) => <Icon key={key} aria-label={label} className={`h-4 w-4 ${tone}`} />)}</span>
  </span>;
}

export function CommissionTierBadges({ tiers, compact: _compact = false, level4Locked = false, closingOnly = false }: { tiers: CommissionTiers; compact?: boolean; level4Locked?: boolean; closingOnly?: boolean }) {
  const { level4Unlocked } = useAffiliateLicense();
  return <RewardIcons types={{ form: !closingOnly && tiers.tier1 > 0, whatsapp: !closingOnly && tiers.tier2 > 0, phone: !closingOnly && tiers.tier3 > 0, closing: !level4Locked && level4Unlocked && tiers.tier4 > 0 }} />;
}

export function GuestTierIcons({ types = {} }: { types?: RewardTypes }) {
  return <RewardIcons types={types} />;
}
export default CommissionTierBadges;
