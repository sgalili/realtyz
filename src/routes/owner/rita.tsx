import { createFileRoute } from "@tanstack/react-router";
import { OwnerRita, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/owner/rita")({
  component: () => (
    <ProtectedRoute><OwnerRita /></ProtectedRoute>
  ),
});
