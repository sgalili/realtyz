import { createFileRoute } from "@tanstack/react-router";
import { Profile, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/profile")({
  component: () => (
    <ProtectedRoute allowGuestDemo><Profile /></ProtectedRoute>
  ),
});
