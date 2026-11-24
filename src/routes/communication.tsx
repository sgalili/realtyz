import { createFileRoute } from "@tanstack/react-router";
import { OmnichannelInbox, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/communication")({
  component: () => (
    <ProtectedRoute allowGuestDemo><OmnichannelInbox /></ProtectedRoute>
  ),
});
