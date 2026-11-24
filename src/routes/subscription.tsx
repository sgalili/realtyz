import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SubscriptionManager } from "@/app/AppRoutes";

export const Route = createFileRoute("/subscription")({
  component: () => (
    <ProtectedRoute allowGuestDemo><SubscriptionManager /></ProtectedRoute>
  ),
});
