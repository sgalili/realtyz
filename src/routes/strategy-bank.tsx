import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBase, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/strategy-bank")({
  component: () => (
    <ProtectedRoute allowGuestDemo><KnowledgeBase /></ProtectedRoute>
  ),
});
