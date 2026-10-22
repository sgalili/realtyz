import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import torafLogo from '@/assets/realtyz-logo.webp';

/** Bundled logo paints on the first frame; the configured master logo replaces it when known. Never shows a text placeholder. */
export function PlatformBrand({ className = '' }: { className?: string }) {
  const { masterBrand } = useWhiteLabel();
  const name = 'TORAFF';
  const logo = masterBrand?.landscape_logo_url || masterBrand?.logo_url || torafLogo;
  return <img src={logo} alt={name} width={182} height={54} loading="eager" fetchPriority="high" decoding="async" style={{ width: 182, height: 54 }} className={`block max-w-[182px] shrink-0 object-contain ${className}`} />;
}
