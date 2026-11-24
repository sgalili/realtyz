import { createFileRoute } from "@tanstack/react-router";
import { AutomationStudioPage, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/automations")({
  component: () => (
    <ProtectedRoute allowGuestDemo><AutomationStudioPage /></ProtectedRoute>
  ),
});
