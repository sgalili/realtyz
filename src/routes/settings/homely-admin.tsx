import { createFileRoute } from "@tanstack/react-router";
import { HomelyAdmin, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/homely-admin")({
  component: () => (
    <ProtectedRoute><HomelyAdmin /></ProtectedRoute>
  ),
});
