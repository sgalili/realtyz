import { createFileRoute } from "@tanstack/react-router";
import { SuperAdmin, SuperAdminRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/super-admin")({
  component: () => (
    <SuperAdminRoute><SuperAdmin /></SuperAdminRoute>
  ),
});
