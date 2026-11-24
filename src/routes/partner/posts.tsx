import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/partner/posts")({
  component: () => (
    <Navigate to="/posts" replace />
  ),
});
