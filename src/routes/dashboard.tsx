import { createFileRoute } from "@tanstack/react-router";
import { Index, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedRoute allowGuestDemo><Index /></ProtectedRoute>
  ),
});
