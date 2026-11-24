import { createFileRoute } from "@tanstack/react-router";
import { ListingsRoute, PropertiesHub, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/properties-hub")({
  component: () => (
    <ListingsRoute><ProtectedRoute allowGuestDemo><PropertiesHub /></ProtectedRoute></ListingsRoute>
  ),
});
