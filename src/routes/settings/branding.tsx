import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute, WhiteLabelSettings } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/branding")({
  component: () => (
    <ProtectedRoute><WhiteLabelSettings /></ProtectedRoute>
  ),
});
