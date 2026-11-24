import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { CommunityOfficePage, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/agency/$userId")({
  component: () => (
    <PublicProfileShell><Suspense fallback={<PageLoader />}><CommunityOfficePage /></Suspense></PublicProfileShell>
  ),
});
