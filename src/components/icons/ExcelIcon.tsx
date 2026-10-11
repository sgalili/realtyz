import { cn } from '@/lib/utils';
import excelLogo from '@/assets/microsoft-excel.svg.asset.json';

/**
 * Original Microsoft Excel brand asset, sized by the surrounding control.
 */
export function ExcelIcon({ className }: { className?: string }) {
  return (
    <img
      src={excelLogo.url}
      alt=""
      className={cn('shrink-0 object-contain', className)}
      aria-hidden="true"
    />
  );
}
