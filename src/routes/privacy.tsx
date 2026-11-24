import { createFileRoute } from "@tanstack/react-router";
import { PrivacyDashboard, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/privacy")({
  component: () => (
    <ProtectedRoute><PrivacyDashboard /></ProtectedRoute>
  ),
});
