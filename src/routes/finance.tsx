import { createFileRoute } from "@tanstack/react-router";
import { Finance, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/finance")({
  component: () => (
    <ProtectedRoute allowGuestDemo><Finance /></ProtectedRoute>
  ),
});
