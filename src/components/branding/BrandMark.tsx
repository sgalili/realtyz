import { Link } from 'react-router-dom';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useWorkspace } from '@/hooks/useWorkspace';
import { resolveWorkspaceIdentity } from '@/lib/workspaceIdentity';

interface BrandMarkProps {
  className?: string;
  to?: string;
  /** Fallback label if no agency branding configured */
  fallbackLabel?: string;
}

/**
 * Renders the agency logo + name when white-label branding is configured,
 * otherwise falls back to the Realtyz AI wordmark unless the user explicitly hid it.
 *
 * Both sources (white-label settings and the workspace list) hydrate
 * synchronously from localStorage, so the workspace logo paints on the FIRST
 * frame with no flicker or default-logo fallback.
 */
export function BrandMark({ className = '', to = '/', fallbackLabel = 'Realtyz AI' }: BrandMarkProps) {
  const { settings, loading } = useWhiteLabel();
  const { activeWorkspace } = useWorkspace();

  // Active workspace ALWAYS wins over the per-user white-label row, and the
  // personal profile name/avatar is never used as branding.
  const identity = resolveWorkspaceIdentity(activeWorkspace, settings as any);
  const logoUrl = identity.logo;
  const agencyName = identity.name || null;
  const hideRealtyz = !!settings?.hide_kalpiz_branding;
  const isDefaultBrand = !identity.isTenant && agencyName === 'Realtyz AI';

  // While branding is still resolving we render nothing rather than the Realtyz
  // fallback, which used to flicker in before the workspace logo arrived.
  const labelToShow = agencyName && !isDefaultBrand
    ? agencyName
    : (hideRealtyz || (loading && !settings) ? '' : fallbackLabel);


  return (
    <Link
      to={to}
      aria-label={`${labelToShow || 'Home'} - דף הבית`}
      className={`realtyz-logo inline-flex items-center gap-2 ${className}`}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt={agencyName ?? 'Agency logo'}
          className="h-7 w-auto max-w-[140px] object-contain"
          loading="eager"
        />
      )}
      {labelToShow && <span className="font-bold tracking-tight">{labelToShow}</span>}
    </Link>
  );
}

export default BrandMark;
