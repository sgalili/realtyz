import { createFileRoute } from "@tanstack/react-router";
import { PlatformSettings, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/platform")({
  component: () => (
    <ProtectedRoute><PlatformSettings /></ProtectedRoute>
  ),
});
