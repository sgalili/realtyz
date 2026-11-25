import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { CommunityProfilePage, PageLoader } from "@/app/AppRoutes";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Navigate } from '@/lib/router-compat';

function ProfileDestination() {
  const mode = usePlatformMode();
  if (mode.isPending) return <PageLoader />;
  return mode.data !== 'full_marketplace' ? <Navigate to="/profile" replace /> : <PublicProfileShell><Suspense fallback={<PageLoader />}><CommunityProfilePage /></Suspense></PublicProfileShell>;
}

export const Route = createFileRoute("/broker/$userId")({
  head: () => ({ meta: [{ title: 'TORAFF | פרופיל מקצועי' }, { name: 'description', content: 'פרופיל מקצועי ונכסים שפורסמו ב־TORAFF.' }, { property: 'og:title', content: 'TORAFF | פרופיל מקצועי' }, { property: 'og:description', content: 'פרופיל מקצועי ונכסים שפורסמו ב־TORAFF.' }, { property: 'og:type', content: 'profile' }, { name: 'twitter:card', content: 'summary' }] }),
  component: ProfileDestination,
});
