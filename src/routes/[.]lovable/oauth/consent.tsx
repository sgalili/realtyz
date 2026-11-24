import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { OAuthConsent, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  component: () => (
    <Suspense fallback={<PageLoader />}><OAuthConsent /></Suspense>
  ),
});
