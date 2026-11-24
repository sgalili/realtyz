import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { DynamicQrRedirect, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/go/")({
  component: () => (
    <Suspense fallback={<PageLoader />}><DynamicQrRedirect /></Suspense>
  ),
});
