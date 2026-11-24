import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { AboutToraff, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/what-is-toraff")({
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><AboutToraff /></Suspense></PublicProfileShell>
  ),
});
