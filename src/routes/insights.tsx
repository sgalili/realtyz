import { createFileRoute } from "@tanstack/react-router";
import { PerformanceInsights, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/insights")({
  component: () => (
    <ProtectedRoute allowGuestDemo><PerformanceInsights /></ProtectedRoute>
  ),
});
