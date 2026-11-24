import { createFileRoute } from "@tanstack/react-router";
import { OwnerLeads, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/owner/leads")({
  component: () => (
    <ProtectedRoute><OwnerLeads /></ProtectedRoute>
  ),
});
