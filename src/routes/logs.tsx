import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/logs")({
  component: () => (
    <Navigate to="/activity-log" replace />
  ),
});
