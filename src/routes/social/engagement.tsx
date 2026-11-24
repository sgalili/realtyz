import { createFileRoute } from "@tanstack/react-router";
import { FbEngagement, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/social/engagement")({
  component: () => (
    <ProtectedRoute><FbEngagement /></ProtectedRoute>
  ),
});
