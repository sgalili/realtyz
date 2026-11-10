import { Award, Building2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  table?: boolean;
  /** Signed-out layout: exclusivity label top-left with icon-only rewards in one row below it. */
  guestStack?: boolean;
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
  table = false,
  guestStack = false,
}: BrokerAttributionProps) {
  const broker = brokerName?.trim() && !brokerName.includes('לא צוין') ? brokerName.trim() : '';
  const office = officeName?.trim() && !officeName.includes('לא צוין') ? officeName.trim() : '';
  const isPrivate = publisherKind === 'private' || (!publisherKind && office === 'מפרסם פרטי');
  const license = !isPrivate && /^[1-9]\d{0,7}$/.test(licenceNumber?.trim() ?? '') ? licenceNumber?.trim() : '';

  return (
    <div data-publisher-attribution className={`flex min-w-0 items-center gap-2 ${table ? '' : 'border-y bg-muted/30'} ${compact ? 'px-2 py-2' : 'px-4 py-3'}`}>
      {isPrivate ? <Avatar className={compact ? 'h-9 w-9' : 'h-12 w-12'}>{logoUrl && <AvatarImage src={logoUrl} alt={broker} className="object-cover" />}<AvatarFallback><UserRound className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" /></AvatarFallback></Avatar> : <div className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background`}>
        {logoUrl ? (
          <img src={logoUrl} alt={`לוגו ${office}`} loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>}
      <div className="min-w-0 flex-1 text-right">
        <p title={broker || 'מפרסם המודעה'} className={`${compact ? 'text-xs' : 'text-sm'} whitespace-normal break-words font-bold text-foreground`}>{broker || 'מפרסם המודעה'}</p>
        {(isPrivate || office || license) && <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {isPrivate && <span>{dealType === 'rent' ? 'משכיר' : dealType === 'sale' ? 'מוכר' : 'מפרסם פרטי'}</span>}
          {!isPrivate && office && office !== 'מפרסם פרטי' && <span title={office} className="min-w-0 whitespace-normal break-words">{office}</span>}
          {license && <span className="shrink-0 whitespace-nowrap">{office ? '· ' : ''}<bdi dir="ltr">{license}</bdi></span>}
        </div>}
        {exclusive && !guestStack && (
          <span className={`flex w-fit items-center gap-1 text-xs font-semibold text-foreground ${compact ? 'mt-1' : 'mt-1.5'}`}>
            <Award className="h-3.5 w-3.5 text-primary" />בבלעדיות
          </span>
        )}
      </div>
      {guestStack && (exclusive || trailing) && <div className="ms-auto flex shrink-0 flex-col items-end gap-1.5 self-start">
        {exclusive && <span className="flex w-fit items-center gap-1 text-xs font-semibold text-foreground"><Award className="h-3.5 w-3.5 text-primary" />בבלעדיות</span>}
        {trailing && <div data-guest-reward-row className="[&_[data-commission-icons]]:justify-end [&_.grid]:flex [&_.grid]:flex-nowrap [&_.grid]:items-center [&_.grid]:gap-2 [&_bdi]:hidden [&_span.text-xs]:hidden [&_svg]:h-4 [&_svg]:w-4">{trailing}</div>}
      </div>}
      {!guestStack && trailing && <div className="ms-auto max-w-[45%] shrink-0 [&_[data-commission-icons]]:justify-end">{trailing}</div>}
    </div>
  );
}