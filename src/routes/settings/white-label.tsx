import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/settings/white-label")({
  component: () => (
    <Navigate to="/settings/branding" replace />
  ),
});
