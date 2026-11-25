import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { LeadPublicProfilePage, PageLoader, ProtectedRoute } from "@/app/AppRoutes";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Navigate } from '@/lib/router-compat';
function ProfileDestination() {
  const mode = usePlatformMode();
  if (mode.isPending) return <PageLoader />;
  return mode.data !== 'full_marketplace' ? <Navigate to="/profile" replace /> : <ProtectedRoute><Suspense fallback={<PageLoader />}><LeadPublicProfilePage /></Suspense></ProtectedRoute>;
}

export const Route = createFileRoute("/lead-profile/$leadId")({
  head: () => ({ meta: [{ title: 'TORAFF | פרטי לקוח' }, { name: 'description', content: 'פרטי לקוח מורשים ב־TORAFF.' }, { property: 'og:title', content: 'TORAFF | פרטי לקוח' }, { property: 'og:description', content: 'פרטי לקוח מורשים ב־TORAFF.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: ProfileDestination,
});
