import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { AboutToraff, PageLoader } from "@/app/AppRoutes";
import { visitorRouteHead } from '@/lib/platformPresentation';

export const Route = createFileRoute("/about-toraff")({
  head: () => visitorRouteHead('/about-toraff'),
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><AboutToraff /></Suspense></PublicProfileShell>
  ),
});
