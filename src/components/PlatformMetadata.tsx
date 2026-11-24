import { Helmet } from 'react-helmet-async';
import { useLocation } from '@/lib/router-compat';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { platformPageMetadata } from '@/lib/platformPresentation';

/** Public-safe setting only; no account or workspace data enters the head. */
export function PlatformMetadata() {
  const { data: mode } = usePlatformMode();
  const { pathname } = useLocation();
  const metadata = platformPageMetadata(mode, pathname, window.location.pathname);
  return <Helmet>
    <title>{metadata.title}</title>
    <meta name="description" content={metadata.description} />
    <meta property="og:title" content={metadata.title} />
    <meta property="og:description" content={metadata.description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={metadata.canonical} />
    <meta name="twitter:title" content={metadata.title} />
    <meta name="twitter:description" content={metadata.description} />
    <link rel="canonical" href={metadata.canonical} />
  </Helmet>;
}