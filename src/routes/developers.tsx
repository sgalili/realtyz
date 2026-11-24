import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Developers, PageLoader, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/developers")({
  component: () => (
    <ProtectedRoute allowGuestDemo><Suspense fallback={<PageLoader />}><Developers /></Suspense></ProtectedRoute>
  ),
});
