import { ClipboardList, Phone, Trophy } from 'lucide-react';
import { fmtILS } from '@/lib/formatCurrency';
import { leadPriceLevel } from '@/lib/leadPriceRanges';
const LEVELS = ['low', 'medium', 'high', 'max'];
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import type { CommissionTiers } from '@/hooks/useAffiliate';

export type RewardTypes = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
const rewardIcons = [
  { key: 'form', label: 'שדות מטופס בעמוד נחיתה', Icon: ClipboardList, tone: 'text-lead-form' },
  { key: 'whatsapp', label: 'סינון בווטסאפ', Icon: WhatsAppIcon, tone: 'text-lead-whatsapp' },
  { key: 'phone', label: 'שיחת טלפון', Icon: Phone, tone: 'text-lead-phone' },
  { key: 'closing', label: 'סגירת עסקה', Icon: Trophy, tone: 'text-lead-closing' },
] as const;

export function RewardIcons({ types, prices, closingPercent = false, label = 'תגמולים', grid = false, closingLevel }: { closingLevel?: number | null; grid?: boolean; types: RewardTypes; prices?: Partial<Record<keyof RewardTypes, number>>; closingPercent?: boolean; label?: string | null }) {
  const rows = rewardIcons.filter(row => types[row.key] === true);
  if (!rows.length) return null;
  return <span className="inline-flex flex-col gap-1 text-start" data-commission-icons>
    {label && <span className="text-[10px] font-medium text-muted-foreground">{label}</span>}
    <span className={prices || grid ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'flex items-center gap-2'}>{rows.map(({ key, label: title, Icon, tone }) => <span key={key} title={title} className={`inline-flex items-center gap-1 whitespace-nowrap ${tone}`} style={key === 'closing' && closingLevel != null ? { color: `hsl(var(--closing-${['low', 'medium', 'high', 'max'][closingLevel] ?? 'low'}))` } : undefined}><Icon aria-label={title} className="h-3.5 w-3.5 shrink-0" />{prices?.[key] != null && <bdi dir="ltr" style={key !== 'closing' ? { color: `hsl(var(--closing-${LEVELS[leadPriceLevel(key as 'form', Number(prices[key]))]}))` } : undefined}>{key === 'closing' && closingPercent ? `${prices[key]}%` : fmtILS(prices[key])}</bdi>}</span>)}</span>
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
