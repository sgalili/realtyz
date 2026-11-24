import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <Navigate to="/command-center" replace />
  ),
});
