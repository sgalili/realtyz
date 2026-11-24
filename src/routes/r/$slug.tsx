import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, ShortLinkRedirect } from "@/app/AppRoutes";

export const Route = createFileRoute("/r/$slug")({
  component: () => (
    <Suspense fallback={<PageLoader />}><ShortLinkRedirect /></Suspense>
  ),
});
