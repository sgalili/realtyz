import { createFileRoute } from "@tanstack/react-router";
import { Broadcast, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/broadcast")({
  component: () => (
    <ProtectedRoute><Broadcast /></ProtectedRoute>
  ),
});
