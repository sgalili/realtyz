import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { DigitalSignatures, PageLoader, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/signatures")({
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><DigitalSignatures /></Suspense></ProtectedRoute>
  ),
});
