import { createFileRoute } from "@tanstack/react-router";
import { Billing, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/billing")({
  component: () => (
    <ProtectedRoute allowGuestDemo><Billing /></ProtectedRoute>
  ),
});
