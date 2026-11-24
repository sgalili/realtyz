import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SystemHealth } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/system-health")({
  component: () => (
    <ProtectedRoute><SystemHealth /></ProtectedRoute>
  ),
});
