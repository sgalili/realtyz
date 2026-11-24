import { createFileRoute } from "@tanstack/react-router";
import { LiveActivity, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/live-activity")({
  component: () => (
    <ProtectedRoute allowGuestDemo><LiveActivity /></ProtectedRoute>
  ),
});
