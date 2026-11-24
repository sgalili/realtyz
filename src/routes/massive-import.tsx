import { createFileRoute } from "@tanstack/react-router";
import { MassiveImporter, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/massive-import")({
  component: () => (
    <ProtectedRoute allowGuestDemo><MassiveImporter /></ProtectedRoute>
  ),
});
