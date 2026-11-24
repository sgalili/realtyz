import { createFileRoute } from "@tanstack/react-router";
import { MyAdEditRoute, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/my-ads/$id/edit")({
  component: () => (
    <ProtectedRoute><MyAdEditRoute /></ProtectedRoute>
  ),
});
