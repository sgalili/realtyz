import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/command-center")({
  component: () => (
    <ProtectedRoute allowGuestDemo><CommandCenter /></ProtectedRoute>
  ),
});
