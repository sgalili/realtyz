import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, SharedProperty } from "@/app/AppRoutes";

export const Route = createFileRoute("/share/property/$token")({
  component: () => (
    <Suspense fallback={<PageLoader />}><SharedProperty /></Suspense>
  ),
});
