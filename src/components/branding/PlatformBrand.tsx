import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import torafLogo from '@/assets/realtyz-logo.webp';

/**
 * Bundled logo paints on the first frame; the configured master logo replaces it when known.
 * Never shows a text placeholder.
 *
 * CLS guarantee: the width/height attributes carry the logo's intrinsic ratio and CSS
 * aspect-ratio pins it, so the exact final layout box (height class from the caller,
 * width derived from the ratio) is reserved on the very first paint. The logo can never
 * flash large and then shrink while assets or the master brand load — object-contain only
 * letterboxes the pixels inside the already-reserved box.
 */
export function PlatformBrand({ className = '' }: { className?: string }) {
  const { masterBrand } = useWhiteLabel();
  const name = 'TORAFF';
  const logo = masterBrand?.landscape_logo_url || masterBrand?.logo_url || torafLogo;
  return (
    <img
      src={logo}
      alt={name}
      width={600}
      height={204}
      loading="eager"
      fetchPriority="high"
      decoding="async"
      style={{ aspectRatio: '600 / 204' }}
      className={`block w-auto shrink-0 object-contain ${className}`}
    />
  );
}
