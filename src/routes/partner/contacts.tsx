import { createFileRoute } from "@tanstack/react-router";
import { PartnerContacts, PartnerOnlyRoute, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/partner/contacts")({
  component: () => (
    <ProtectedRoute><PartnerOnlyRoute><PartnerContacts /></PartnerOnlyRoute></ProtectedRoute>
  ),
});
