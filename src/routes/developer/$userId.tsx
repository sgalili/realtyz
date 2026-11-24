import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { CommunityProfilePage, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/developer/$userId")({
  component: () => (
    <PublicProfileShell><Suspense fallback={<PageLoader />}><CommunityProfilePage /></Suspense></PublicProfileShell>
  ),
});
