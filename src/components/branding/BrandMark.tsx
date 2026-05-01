import { Link } from 'react-router-dom';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';

interface BrandMarkProps {
  className?: string;
  to?: string;
  /** Fallback label if no agency branding configured */
  fallbackLabel?: string;
}

/**
 * Renders the agency logo + name when white-label branding is configured,
 * otherwise falls back to the Realtyz AI wordmark unless the user explicitly hid it.
 */
export function BrandMark({ className = '', to = '/', fallbackLabel = 'Realtyz AI' }: BrandMarkProps) {
  const { settings } = useWhiteLabel();
  const hasLogo = !!settings?.logo_url;
  const hasName = !!settings?.agency_name;
  const hideKalpiz = !!settings?.hide_kalpiz_branding;

  const labelToShow = hasName ? settings!.agency_name! : (hideKalpiz ? '' : fallbackLabel);

  return (
    <Link
      to={to}
      aria-label={`${labelToShow || 'Home'} - דף הבית`}
      className={`kalpiz-logo inline-flex items-center gap-2 ${className}`}
    >
      {hasLogo && (
        <img
          src={settings!.logo_url!}
          alt={settings?.agency_name ?? 'Agency logo'}
          className="h-7 w-auto max-w-[140px] object-contain"
          loading="eager"
        />
      )}
      {labelToShow && <span className="font-bold tracking-tight">{labelToShow}</span>}
    </Link>
  );
}

export default BrandMark;
