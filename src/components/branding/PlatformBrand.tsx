import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import torafLogo from '@/assets/realtyz-logo.webp';
import wordmark from '@/assets/toraff-wordmark.webp';
import { platformPresentation } from '@/lib/platformPresentation';

/**
 * Bundled logo paints on the first frame; the configured master logo replaces it when known.
 * Brokers-only mode shows the wordmark alone, because the master logo's tagline
 * ("לוח. שותפים. מטורף!") refers to the hidden public board and partner network.
 * Width/height plus aspect-ratio reserve the final box on first paint (no CLS).
 */
export function PlatformBrand({ className = '', tagline = false }: { className?: string; tagline?: boolean }) {
  const { masterBrand } = useWhiteLabel();
  const brokersOnly = useBrokersOnly();
  const name = 'TORAFF';
  const logo = brokersOnly ? wordmark : masterBrand?.landscape_logo_url || masterBrand?.logo_url || torafLogo;
  const image = (
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
  if (!brokersOnly || !tagline) return image;
  // Brokers-only: one shared tagline under the wordmark on every screen.
  return <span className="inline-flex flex-col items-center gap-0.5">{image}<span dir="rtl" className="whitespace-nowrap text-[11px] font-semibold leading-none text-foreground sm:text-xs">{platformPresentation('brokers_only').tagline}</span></span>;
}
