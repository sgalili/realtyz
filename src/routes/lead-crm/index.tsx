import { createFileRoute } from "@tanstack/react-router";
import { LeadCRM, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/lead-crm/")({
  component: () => (
    <ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>
  ),
});
