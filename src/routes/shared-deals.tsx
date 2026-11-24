import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SharedDeals } from "@/app/AppRoutes";

export const Route = createFileRoute("/shared-deals")({
  component: () => (
    <ProtectedRoute><SharedDeals /></ProtectedRoute>
  ),
});
