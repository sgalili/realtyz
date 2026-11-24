import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SecurityDashboard } from "@/app/AppRoutes";

export const Route = createFileRoute("/security")({
  component: () => (
    <ProtectedRoute allowGuestDemo><SecurityDashboard /></ProtectedRoute>
  ),
});
