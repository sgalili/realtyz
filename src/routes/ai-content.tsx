import { createFileRoute } from "@tanstack/react-router";
import { AIContentGenerator, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/ai-content")({
  component: () => (
    <ProtectedRoute allowGuestDemo><AIContentGenerator /></ProtectedRoute>
  ),
});
