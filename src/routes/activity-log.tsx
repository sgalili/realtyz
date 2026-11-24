import { createFileRoute } from "@tanstack/react-router";
import { ActivityLog, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/activity-log")({
  component: () => (
    <ProtectedRoute allowGuestDemo><ActivityLog /></ProtectedRoute>
  ),
});
