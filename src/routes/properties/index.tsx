import { createFileRoute } from "@tanstack/react-router";
import { ListingsRoute, Properties, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/properties/")({
  component: () => (
    <ListingsRoute><ProtectedRoute allowGuestDemo><Properties /></ProtectedRoute></ListingsRoute>
  ),
});
