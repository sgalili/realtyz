import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/ads")({
  component: () => (
    <Navigate to="/campaigns?tab=campaigns" replace />
  ),
});
