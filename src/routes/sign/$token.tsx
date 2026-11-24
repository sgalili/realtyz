import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, SignDocument } from "@/app/AppRoutes";

export const Route = createFileRoute("/sign/$token")({
  component: () => (
    <Suspense fallback={<PageLoader />}><SignDocument /></Suspense>
  ),
});
