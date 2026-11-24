import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { DynamicQrRedirect, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/go/$codeId")({
  component: () => (
    <Suspense fallback={<PageLoader />}><DynamicQrRedirect key={window.location.pathname} /></Suspense>
  ),
});
