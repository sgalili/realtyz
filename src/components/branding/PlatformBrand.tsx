import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import torafLogo from '@/assets/realtyz-logo.png';

/** Bundled logo paints on the first frame; the configured master logo replaces it when known. Never shows a text placeholder. */
export function PlatformBrand({ className = '' }: { className?: string }) {
  const { masterBrand } = useWhiteLabel();
  const name = masterBrand?.agency_name || 'TORAFF';
  const logo = masterBrand?.landscape_logo_url || masterBrand?.logo_url || torafLogo;
  return <img src={logo} alt={name} loading="eager" decoding="sync" className={`w-auto max-w-[182px] object-contain ${className}`} />;
}
