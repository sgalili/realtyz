import { useWhiteLabel } from '@/hooks/useWhiteLabel';

export function PlatformBrand({ className = '' }: { className?: string }) {
  const { masterBrand } = useWhiteLabel();
  const name = masterBrand?.agency_name || 'TORAF';
  const logo = masterBrand?.landscape_logo_url || masterBrand?.logo_url;
  return logo
    ? <img src={logo} alt={name} className={`w-auto max-w-[182px] object-contain ${className}`} />
    : <span dir="ltr" className="text-2xl font-bold text-primary">{name}</span>;
}