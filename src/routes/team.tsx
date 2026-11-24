import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, Team } from "@/app/AppRoutes";

export const Route = createFileRoute("/team")({
  component: () => (
    <ProtectedRoute><Team /></ProtectedRoute>
  ),
});
