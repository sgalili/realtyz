import { createFileRoute } from "@tanstack/react-router";
import { LiveConversations, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/live-conversations")({
  component: () => (
    <ProtectedRoute allowGuestDemo><LiveConversations /></ProtectedRoute>
  ),
});
