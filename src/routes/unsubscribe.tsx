import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, Unsubscribe } from "@/app/AppRoutes";

export const Route = createFileRoute("/unsubscribe")({
  component: () => (
    <Suspense fallback={<PageLoader />}><Unsubscribe /></Suspense>
  ),
});
