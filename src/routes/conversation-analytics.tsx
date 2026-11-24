import { createFileRoute } from "@tanstack/react-router";
import { ConversationAnalytics, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/conversation-analytics")({
  component: () => (
    <ProtectedRoute allowGuestDemo><ConversationAnalytics /></ProtectedRoute>
  ),
});
