import { Award, Building2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

type BrokerAttributionProps = {
  brokerName?: string | null;
  officeName?: string | null;
  licenceNumber?: string | null;
  logoUrl?: string | null;
  compact?: boolean;
  exclusive?: boolean;
  publisherKind?: string | null;
  dealType?: string | null;
  trailing?: ReactNode;
};

export default function BrokerAttribution({
  brokerName,
  officeName,
  licenceNumber,
  logoUrl,
  compact = false,
  exclusive = false,
  publisherKind,
  dealType,
  trailing,
}: BrokerAttributionProps) {
  const broker = brokerName?.trim() && !brokerName.includes('לא צוין') ? brokerName.trim() : '';
  const office = officeName?.trim() && !officeName.includes('לא צוין') ? officeName.trim() : '';
  const isPrivate = publisherKind === 'private' || (!publisherKind && office === 'מפרסם פרטי');
  const license = !isPrivate && /^[1-9]\d{0,7}$/.test(licenceNumber?.trim() ?? '') ? licenceNumber?.trim() : '';

  return (
    <div data-publisher-attribution className={`flex min-w-0 items-center gap-2 border-y bg-muted/30 ${compact ? 'px-2 py-2' : 'px-4 py-3'}`}>
      {isPrivate ? <Avatar className={compact ? 'h-9 w-9' : 'h-12 w-12'}><AvatarFallback><UserRound className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" /></AvatarFallback></Avatar> : <div className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background`}>
        {logoUrl && !isPrivate ? (
          <img src={logoUrl} alt={`לוגו ${office}`} loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          isPrivate ? <UserRound className="h-6 w-6 fill-muted-foreground/20 text-muted-foreground drop-shadow-sm" strokeWidth={1.5} aria-hidden="true" /> : <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>}
      <div className="min-w-0 flex-1 text-right">
        <p title={broker || 'מפרסם המודעה'} className={`${compact ? 'text-xs' : 'text-sm'} truncate font-bold text-foreground`}>{broker || 'מפרסם המודעה'}</p>
        {(isPrivate || office || license) && <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {isPrivate ? <span>{dealType === 'rent' ? 'משכיר פרטי' : dealType === 'sale' ? 'מוכר פרטי' : 'מפרסם פרטי'}</span> : office && <span title={office} className="min-w-0 truncate">{office}</span>}
          {license && <span className="shrink-0 whitespace-nowrap">{office ? '· ' : ''}רישיון {license}</span>}
        </div>}
      </div>
      {trailing && <div className="ms-auto max-w-[45%] shrink-0 [&_[data-commission-icons]]:justify-end">{trailing}</div>}
      {exclusive && (
        <span className={`-me-1 flex shrink-0 items-center gap-1 self-start text-xs font-semibold text-foreground ${compact ? 'mt-2' : 'mt-3'}`}>
          <Award className="h-3.5 w-3.5 text-primary" />בבלעדיות
        </span>
      )}
    </div>
  );
}