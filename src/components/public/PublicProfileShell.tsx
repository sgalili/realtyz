import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';
import { PageHero } from '@/components/PageHero';
import { VisitorMenu } from '@/components/public/VisitorMenu';

/** Standalone broker/agency pages: signed-in users get the app shell, guests the public site header. */
export function PublicProfileShell({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (user && !loading) return <AppLayout>{children}</AppLayout>;
  return <div dir="rtl" className="flex h-[100dvh] flex-col overflow-hidden bg-background">
    <header className="relative z-20 shrink-0 border-b border-border bg-card">
      <div className="mx-auto grid min-h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-[15px] pt-2 sm:min-h-16 sm:gap-x-3">
        <div className="flex items-center justify-start"><VisitorMenu onSignup={() => navigate('/auth')} /></div>
        <Link to="/" aria-label="TORAFF - דף הבית" className="justify-self-center"><PlatformBrand className="h-[52px] shrink-0 sm:h-[65px]" /></Link>
        <div className="flex items-center justify-end"><PublicListingPublisher autoResume triggerClassName="!w-[88px] sm:!w-[114px] !px-1 !text-[17px] sm:!text-[20px]" /></div>
      </div>
    </header>
    <div className={`realtyz-main-surface min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${hero ? '' : 'pt-[15px]'}`}>{hero && <PageHero />}{children}</div>
  </div>;
}
