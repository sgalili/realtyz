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
  const broker = brokerName?.trim() || 'שם המתווך לא צוין';
  const office = officeName?.trim() || 'שם המשרד לא צוין';

  return (
    <div className={`flex items-center gap-3 border-y bg-muted/30 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background`}>
        {logoUrl ? (
          <img src={logoUrl} alt={`לוגו ${office}`} loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 text-right">
        <p className={`${compact ? 'text-xs' : 'text-sm'} truncate font-bold text-foreground`}>{broker}</p>
        <p className="truncate text-xs font-medium text-muted-foreground">{office}</p>
        {licenceNumber?.trim() ? (
          <p className="truncate text-xs font-medium text-muted-foreground">רישיון תיווך {licenceNumber.trim()}</p>
        ) : null}
      </div>
    </div>
  );
}