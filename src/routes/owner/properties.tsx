import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/owner/properties")({
  component: () => (
    <Navigate to="/my-ads" replace />
  ),
});
