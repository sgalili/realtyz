import { Building2 } from 'lucide-react';

type BrokerAttributionProps = {
  brokerName?: string | null;
  officeName?: string | null;
  licenceNumber?: string | null;
  logoUrl?: string | null;
  compact?: boolean;
};

export default function BrokerAttribution({
  brokerName,
  officeName,
  licenceNumber,
  logoUrl,
  compact = false,
}: BrokerAttributionProps) {
  const broker = brokerName?.trim() && !brokerName.includes('לא צוין') ? brokerName.trim() : '';
  const office = officeName?.trim() && !officeName.includes('לא צוין') ? officeName.trim() : '';
  const license = /^[1-9]\d{0,7}$/.test(licenceNumber?.trim() ?? '') ? licenceNumber?.trim() : '';

  return (
    <div data-publisher-attribution className={`flex min-w-0 items-center gap-3 border-y bg-muted/30 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background`}>
        {logoUrl ? (
          <img src={logoUrl} alt={`לוגו ${office}`} loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-right">
        <p className={`${compact ? 'text-xs' : 'text-sm'} break-words font-bold text-foreground`}>{broker || 'מפרסם המודעה'}</p>
        {(office || license) && <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {office && <span title={office} className="min-w-0 truncate">{office}</span>}
          {license && <span className="shrink-0 whitespace-nowrap">{office ? '· ' : ''}רישיון {license}</span>}
        </div>}
      </div>
    </div>
  );
}