import { Helmet } from 'react-helmet-async';
import { useLocation } from '@/lib/router-compat';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { platformPageMetadata } from '@/lib/platformPresentation';
import { useEffect } from 'react';

/** Public-safe setting only; no account or workspace data enters the head. */
export function PlatformMetadata() {
  const { data: mode } = usePlatformMode();
  const { pathname } = useLocation();
  const metadata = platformPageMetadata(mode, pathname, window.location.pathname);
  // React 19 hoists Helmet tags alongside the router head. Keep retained head nodes
  // current as well, so the root fallback cannot shadow a visitor leaf description.
  useEffect(() => {
    if (!['/about-toraff', '/faq', '/terms', '/privacy-policy', '/commission-mechanism', '/pricing', '/contact'].includes(pathname)) return;
    const values = [
      ['meta[name="description"]', metadata.description],
      ['meta[property="og:title"]', metadata.title],
      ['meta[property="og:description"]', metadata.description],
      ['meta[name="twitter:title"]', metadata.title],
      ['meta[name="twitter:description"]', metadata.description],
    ];
    for (const entry of values) {
      const [selector, content] = entry;
      if (!selector || !content) continue;
      document.head.querySelectorAll(selector).forEach(node => node.setAttribute('content', content));
    }
  }, [pathname, metadata.title, metadata.description]);
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