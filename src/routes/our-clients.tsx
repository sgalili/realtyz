import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { OurClients, PageLoader, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/our-clients")({
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><OurClients /></Suspense></ProtectedRoute>
  ),
});
