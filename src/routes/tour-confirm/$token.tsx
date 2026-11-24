import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, TourConfirm } from "@/app/AppRoutes";

export const Route = createFileRoute("/tour-confirm/$token")({
  component: () => (
    <Suspense fallback={<PageLoader />}><TourConfirm /></Suspense>
  ),
});
