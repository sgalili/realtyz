import { createFileRoute } from "@tanstack/react-router";
import { ListingsRoute, PropertyDetail, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/properties/$id")({
  component: () => (
    <ListingsRoute><ProtectedRoute allowGuestDemo><PropertyDetail /></ProtectedRoute></ListingsRoute>
  ),
});
