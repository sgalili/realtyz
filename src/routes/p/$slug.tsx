import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, PublicListingPage } from "@/app/AppRoutes";

export const Route = createFileRoute("/p/$slug")({
  component: () => (
    <Suspense fallback={<PageLoader />}><PublicListingPage /></Suspense>
  ),
});
