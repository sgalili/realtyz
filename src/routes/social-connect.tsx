import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SocialConnect } from "@/app/AppRoutes";

export const Route = createFileRoute("/social-connect")({
  component: () => (
    <ProtectedRoute allowGuestDemo><SocialConnect /></ProtectedRoute>
  ),
});
