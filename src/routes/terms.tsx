import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { PageLoader, Terms } from "@/app/AppRoutes";
import { visitorRouteHead } from '@/lib/platformPresentation';

export const Route = createFileRoute("/terms")({
  head: () => visitorRouteHead('/terms'),
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><Terms /></Suspense></PublicProfileShell>
  ),
});
