import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, ProtectedRoute, Wallet } from "@/app/AppRoutes";

export const Route = createFileRoute("/wallet")({
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><Wallet /></Suspense></ProtectedRoute>
  ),
});
