import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { PageLoader, PrivacyPolicy } from "@/app/AppRoutes";

export const Route = createFileRoute("/privacy-policy")({
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense></PublicProfileShell>
  ),
});
