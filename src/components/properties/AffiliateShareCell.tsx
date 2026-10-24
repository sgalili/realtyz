import { ClipboardList, Handshake, MessageCircle, Phone, SquareArrowOutUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AffiliateCommissionButton } from '@/components/properties/AffiliateCommissionButton';
import { type AffiliateConfigRow } from '@/hooks/useAffiliate';
import { publicUrl } from '@/lib/publicUrl';
import LeadPricingDialog from '@/components/affiliate/LeadPricingDialog';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';

const money = (n: number) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

type Tier = { value: string; label: string; Icon: typeof ClipboardList };

/**
 * Per-stage partner rewards as plain text, in the same two-column layout the
 * affiliate table uses. Zero amounts are hidden — no pills, no text labels.
 */
export function AffiliateTierPrices({ config }: { config?: AffiliateConfigRow }) {
  const tiers: Tier[] = [];
  if (config?.affiliate_enabled) {
    const t1 = Number(config.affiliate_tier1_amount ?? 0);
    const t2 = Number(config.affiliate_tier2_amount ?? 0);
    const t3 = Number(config.affiliate_tier3_amount ?? 0);
    if (t1) tiers.push({ value: money(t1), label: 'שדות בטופס דף נחיתה', Icon: ClipboardList });
    if (t2) tiers.push({ value: money(t2), label: 'שיחת WhatsApp', Icon: MessageCircle });
    if (t3) tiers.push({ value: config.affiliate_tier3_type === 'percent' ? `${t3}%` : money(t3), label: 'שיחת טלפון', Icon: Phone });
  }
  if (tiers.length === 0 && !(config?.affiliate_enabled && Number(config.affiliate_tier4_amount) > 0)) return null;
  return (
    <LeadPricingDialog readOnly gross listing={{ listing_id: config?.id ?? '', broker_id: '', property_title: null, tier1_amount: Number(config?.affiliate_tier1_amount ?? 0), tier2_amount: Number(config?.affiliate_tier2_amount ?? 0), tier3_amount: Number(config?.affiliate_tier3_amount ?? 0), tier3_type: config?.affiliate_tier3_type ?? 'fixed', tier4_amount: Number(config?.affiliate_tier4_amount ?? 0), tier4_type: config?.affiliate_tier4_type === 'percent' ? 'percent' : 'fixed' }}><CommissionTierBadges tiers={{ tier1: Number(config?.affiliate_tier1_amount ?? 0), tier2: Number(config?.affiliate_tier2_amount ?? 0), tier3: Number(config?.affiliate_tier3_amount ?? 0), tier4: Number(config?.affiliate_tier4_amount ?? 0), tier4Type: config?.affiliate_tier4_type === 'percent' ? 'percent' : 'fixed' }} compact /></LeadPricingDialog>
  );
}

/**
 * Unified partner column for property tables: one icon button (green when the
 * property is open for partner marketing) and the guarded property-page link.
 * The reward amounts live in the adjacent "עמלות" column.
 */
export function AffiliateShareCell({ listingId, config }: { listingId: string; config?: AffiliateConfigRow }) {
  const shared = Boolean(config?.affiliate_enabled);
  return (
    <div className="flex items-center gap-1">
      <AffiliateCommissionButton listingId={listingId} shared={shared} />
      {shared ? (
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="פתיחת עמוד הנכס" aria-label="פתיחת עמוד הנכס"><a href={publicUrl(`/p/${listingId}`)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}><SquareArrowOutUpLeft className="h-4 w-4" /></a></Button>
      ) : null}
    </div>
  );
}

export { Handshake };
