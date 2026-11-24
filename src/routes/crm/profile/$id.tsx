import { createFileRoute } from "@tanstack/react-router";
import { CrmProfile, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/crm/profile/$id")({
  component: () => (
    <ProtectedRoute><CrmProfile /></ProtectedRoute>
  ),
});
