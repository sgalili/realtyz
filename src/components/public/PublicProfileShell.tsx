import { platformPresentation } from '@/lib/platformPresentation';
import type { ReactNode } from 'react';
import { Link, useNavigate } from '@/lib/router-compat';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';
import { PageHero } from '@/components/PageHero';
import { VisitorMenu } from '@/components/public/VisitorMenu';
import { PageLoadingRegion } from '@/components/ui/full-page-loading';
import { useBrokersOnly } from '@/hooks/usePlatformMode';

/** Standalone broker/agency pages: signed-in users get the app shell, guests the public site header. */
export function PublicProfileShell({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  const { user, loading } = useAuth();
  const brokersOnly = useBrokersOnly();
  const navigate = useNavigate();
  if (user && !loading) return <AppLayout>{children}</AppLayout>;
  return <div dir="rtl" className="public-site-shell flex h-[100dvh] flex-col overflow-hidden bg-background">
    <header className="relative z-20 shrink-0 border-b border-border bg-card">
      <div className="mx-auto grid min-h-16 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-[15px] pt-2 sm:min-h-16 sm:gap-x-3">
        <div className="flex items-center justify-start"><VisitorMenu onSignup={() => navigate(brokersOnly ? '/auth?mode=signup' : '/auth')} /></div>
        <Link to="/" aria-label="TORAFF - דף הבית" className="justify-self-center">{brokersOnly ? <span className="flex flex-col items-center gap-0.5"><PlatformBrand className="h-[24px]" /><span className="whitespace-nowrap text-[11px] font-semibold leading-none text-foreground sm:text-xs">{platformPresentation('brokers_only').tagline}</span></span> : <PlatformBrand className="h-[52px] shrink-0 sm:h-[65px]" />}</Link>
        <div className="flex items-center justify-end">{!brokersOnly && <PublicListingPublisher autoResume triggerClassName="!w-[88px] sm:!w-[114px] !px-1 !text-[17px] sm:!text-[20px]" />}</div>
      </div>
    </header>
    {hero && <PageHero />}
    <PageLoadingRegion className={`realtyz-main-surface min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden pb-[var(--app-footer-space)] ${hero ? '' : 'pt-[15px]'}`}>
      {children}
    </PageLoadingRegion>
  </div>;
}
