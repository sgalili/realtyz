import { createFileRoute } from "@tanstack/react-router";
import { ApiSettings, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/api-settings")({
  component: () => (
    <ProtectedRoute allowGuestDemo><ApiSettings /></ProtectedRoute>
  ),
});
