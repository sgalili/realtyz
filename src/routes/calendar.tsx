import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/calendar")({
  component: () => (
    <Navigate to="/campaigns?tab=calendar" replace />
  ),
});
