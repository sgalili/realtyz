import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/campaign-strategy")({
  component: () => (
    <Navigate to="/campaigns?tab=strategy" replace />
  ),
});
