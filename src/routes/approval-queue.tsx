import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/approval-queue")({
  component: () => (
    <Navigate to="/campaigns?tab=approvals" replace />
  ),
});
