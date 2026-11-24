import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Landing, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/landing")({
  component: () => (
    <Suspense fallback={<PageLoader />}><Landing /></Suspense>
  ),
});
