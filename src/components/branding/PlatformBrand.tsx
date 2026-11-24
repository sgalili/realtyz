import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import torafLogo from '@/assets/realtyz-logo.webp';
import wordmark from '@/assets/toraff-wordmark.webp';

/**
 * Bundled logo paints on the first frame; the configured master logo replaces it when known.
 * Brokers-only mode shows the wordmark alone, because the master logo's tagline
 * ("לוח. שותפים. מטורף!") refers to the hidden public board and partner network.
 * Width/height plus aspect-ratio reserve the final box on first paint (no CLS).
 */
export function PlatformBrand({ className = '' }: { className?: string }) {
  const { masterBrand } = useWhiteLabel();
  const brokersOnly = useBrokersOnly();
  const name = 'TORAFF';
  const logo = brokersOnly ? wordmark : masterBrand?.landscape_logo_url || masterBrand?.logo_url || torafLogo;
  return (
    <img
      src={logo}
      alt={name}
      width={brokersOnly ? 1296 : 600}
      height={brokersOnly ? 240 : 204}
      loading="eager"
      fetchPriority="high"
      decoding="async"
      style={{ aspectRatio: brokersOnly ? '1296 / 240' : '600 / 204' }}
      className={`block w-auto shrink-0 object-contain ${brokersOnly ? 'max-h-8' : ''} ${className}`}
    />
  );
}
