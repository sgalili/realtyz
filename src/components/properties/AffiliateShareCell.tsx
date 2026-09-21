import { ClipboardList, Handshake, MessageCircle, Phone, SquareArrowOutUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AffiliateCommissionButton } from '@/components/properties/AffiliateCommissionButton';
import { type AffiliateConfigRow } from '@/hooks/useAffiliate';
import { publicUrl } from '@/lib/publicUrl';

const money = (n: number) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

/**
 * Unified partner column for property tables: one icon button (green when the
 * property is open for partner marketing), a guarded remove-from-marketing
 * button, and the per-stage rewards as plain text underneath. Zero amounts are
 * hidden — no pills, no text labels.
 */
export function AffiliateShareCell({ listingId, config }: { listingId: string; config?: AffiliateConfigRow }) {
  const shared = Boolean(config?.affiliate_enabled);
  const tiers: Array<{ value: string; label: string; Icon: typeof ClipboardList }> = [];
  if (shared && config) {
    const t1 = Number(config.affiliate_tier1_amount ?? 0);
    const t2 = Number(config.affiliate_tier2_amount ?? 0);
    const t3 = Number(config.affiliate_tier3_amount ?? 0);
    if (t1) tiers.push({ value: money(t1), label: 'טופס דיגיטלי', Icon: ClipboardList });
    if (t2) tiers.push({ value: money(t2), label: 'שיחת WhatsApp', Icon: MessageCircle });
    if (t3) tiers.push({ value: config.affiliate_tier3_type === 'percent' ? `${t3}%` : money(t3), label: 'שיחת טלפון', Icon: Phone });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="inline-flex items-center gap-1">
        <AffiliateCommissionButton listingId={listingId} shared={shared} />
        {shared ? <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="פתיחת עמוד הנכס" aria-label="פתיחת עמוד הנכס"><a href={publicUrl(`/p/${listingId}`)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><SquareArrowOutUpLeft className="h-4 w-4" /></a></Button> : null}
      </div>
      {tiers.length > 0 ? (
        <div className="space-y-0.5 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
          {tiers.map(({ value, label, Icon }) => <div key={label} className="flex items-center justify-center gap-1" title={label}><Icon className="h-3 w-3" /><bdi dir="ltr">{value}</bdi></div>)}
        </div>
      ) : null}
    </div>
  );
}

export { Handshake };
