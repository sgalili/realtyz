import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/pricing")({
  component: () => (
    <Navigate to="/wallet" replace />
  ),
});
