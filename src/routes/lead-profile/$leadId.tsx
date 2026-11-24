import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { LeadPublicProfilePage, PageLoader, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/lead-profile/$leadId")({
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><LeadPublicProfilePage /></Suspense></ProtectedRoute>
  ),
});
