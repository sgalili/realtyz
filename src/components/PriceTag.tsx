import { fmtILS, fmtILSCompact } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';

type Props = {
  value: number | null | undefined;
  compact?: boolean;
  fractionDigits?: number;
  className?: string;
};

/**
 * RTL-safe price renderer. Locks ₪ on the LEFT of digits via <bdi dir="ltr">.
 * Use everywhere instead of inline `${n} ₪` or `₪${n}` strings.
 */
export function PriceTag({ value, compact, fractionDigits, className }: Props) {
  const text = compact ? fmtILSCompact(value) : fmtILS(value, { fractionDigits });
  return (
    <bdi dir="ltr" className={cn('inline-block font-medium tabular-nums', className)}>
      {text}
    </bdi>
  );
}
