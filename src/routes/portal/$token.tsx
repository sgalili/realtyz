import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ClientPortal, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/portal/$token")({
  component: () => (
    <Suspense fallback={<PageLoader />}><ClientPortal /></Suspense>
  ),
});
