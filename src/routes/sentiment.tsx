import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, SentimentDashboard } from "@/app/AppRoutes";

export const Route = createFileRoute("/sentiment")({
  component: () => (
    <ProtectedRoute allowGuestDemo><SentimentDashboard /></ProtectedRoute>
  ),
});
