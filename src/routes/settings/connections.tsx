import { createFileRoute } from "@tanstack/react-router";
import { ConnectionSettings, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/connections")({
  component: () => (
    <ProtectedRoute allowGuestDemo><ConnectionSettings /></ProtectedRoute>
  ),
});
