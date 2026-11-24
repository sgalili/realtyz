import { createFileRoute } from "@tanstack/react-router";
import { AiDialer, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/ai-dialer")({
  component: () => (
    <ProtectedRoute><AiDialer /></ProtectedRoute>
  ),
});
