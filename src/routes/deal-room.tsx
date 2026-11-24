import { createFileRoute } from "@tanstack/react-router";
import { DealsRoute, ProtectedRoute, RoleTransactions } from "@/app/AppRoutes";

export const Route = createFileRoute("/deal-room")({
  component: () => (
    <DealsRoute><ProtectedRoute allowGuestDemo><RoleTransactions /></ProtectedRoute></DealsRoute>
  ),
});
