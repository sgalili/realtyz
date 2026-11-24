import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, PublishingHistory } from "@/app/AppRoutes";

export const Route = createFileRoute("/activity-history")({
  component: () => (
    <ProtectedRoute><PublishingHistory /></ProtectedRoute>
  ),
});
