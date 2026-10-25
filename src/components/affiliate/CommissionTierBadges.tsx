import { ClipboardList, Phone, Trophy } from 'lucide-react';
import { fmtILS } from '@/lib/formatCurrency';
import { leadPriceLevel } from '@/lib/leadPriceRanges';
const LEVELS = ['low', 'medium', 'high', 'max'];
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import type { CommissionTiers } from '@/hooks/useAffiliate';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { RestrictedClosingReward } from './BrokerClosingInfo';

export type RewardTypes = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
const rewardIcons = [
  { key: 'form', label: 'שדות מטופס בעמוד נחיתה', Icon: ClipboardList, tone: 'text-lead-form' },
  { key: 'whatsapp', label: 'סינון בווטסאפ', Icon: WhatsAppIcon, tone: 'text-lead-whatsapp' },
  { key: 'phone', label: 'שיחת טלפון', Icon: Phone, tone: 'text-lead-phone' },
  { key: 'closing', label: 'סגירת עסקה', Icon: Trophy, tone: 'text-lead-closing' },
] as const;

export function RewardIcons({ levels, types, prices, zeroTypes, closingPercent = false, label = 'תגמולים', grid = false, closingLevel }: { levels?: Partial<Record<'form' | 'whatsapp' | 'phone', number | null>>; closingLevel?: number | null; grid?: boolean; types: RewardTypes; zeroTypes?: RewardTypes; prices?: Partial<Record<keyof RewardTypes, number>>; closingPercent?: boolean; label?: string | null }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const rows = rewardIcons.filter(row => types[row.key] === true);
  if (!rows.length) return null;
  return <span className="inline-flex flex-col gap-1 text-start" data-commission-icons>
    {label && <span className="text-[10px] font-medium text-muted-foreground">{label}</span>}
    <span className={prices || grid ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'flex items-center gap-2'}>{rows.map(({ key, label: title, Icon, tone }) => {
      // Signed-out visitors get icons only: a gray icon carries both the zero-fee
      // and the restricted-closing message. Signed-in users also get the labels.
      if (key === 'closing' && (!user || !level4Unlocked)) return <RestrictedClosingReward key={key} className="whitespace-nowrap" showLabel={!!user} />;
      // Icon and price share one level color: closing uses its server level, lead types their price level.
      const level = key === 'closing' ? closingLevel : prices?.[key] != null ? leadPriceLevel(key as 'form', Number(prices[key])) : levels?.[key as 'form'] ?? null;
      const zero = zeroTypes ? zeroTypes[key] === true : prices?.[key] === 0;
      return <span key={key} title={title} className={`inline-flex items-center gap-1 whitespace-nowrap ${zero ? 'lead-no-fee' : tone}`} style={!zero && level != null ? { color: `hsl(var(--closing-${LEVELS[level] ?? 'low'}))` } : undefined}><Icon aria-label={title} className="h-3.5 w-3.5 shrink-0" />{zero ? user && <span className="text-xs font-semibold">ללא עמלה</span> : prices?.[key] != null && <bdi dir="ltr">{key === 'closing' && closingPercent ? `${prices[key]}%` : fmtILS(key === 'closing' ? Math.round(prices[key] ?? 0) : prices[key] ?? 0)}</bdi>}</span>;
    })}</span>
  </span>;
}

export function CommissionTierBadges({ tiers, compact: _compact = false, level4Locked = false, closingOnly = false }: { tiers: CommissionTiers; compact?: boolean; level4Locked?: boolean; closingOnly?: boolean }) {
  const { level4Unlocked } = useAffiliateLicense();
  const { user } = useAuth();
  const { isSuperAdmin, roles } = useUserRole();
  const showAll = !user || isSuperAdmin || roles.some(role => ['managing_broker', 'lead_agent', 'agent'].includes(role));
  return <RewardIcons zeroTypes={{ form: tiers.tier1 === 0, whatsapp: tiers.tier2 === 0, phone: tiers.tier3 === 0, closing: level4Unlocked && tiers.tier4 === 0 }} types={{ form: !closingOnly && (showAll || tiers.tier1 > 0), whatsapp: !closingOnly && (showAll || tiers.tier2 > 0), phone: !closingOnly && (showAll || tiers.tier3 > 0), closing: !level4Locked }} />;
}

export function GuestTierIcons({ types = {} }: { types?: RewardTypes }) {
  return <RewardIcons types={{ form: true, whatsapp: true, phone: true, closing: true }} zeroTypes={Object.fromEntries(Object.entries(types).map(([key, active]) => [key, active === false]))} />;
}
export default CommissionTierBadges;
