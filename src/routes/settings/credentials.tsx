import { createFileRoute } from "@tanstack/react-router";
import { PlatformCredentials, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/settings/credentials")({
  component: () => (
    <ProtectedRoute><PlatformCredentials /></ProtectedRoute>
  ),
});
