import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { OAuthCallback, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/oauth/callback")({
  component: () => (
    <Suspense fallback={<PageLoader />}><OAuthCallback /></Suspense>
  ),
});
