import { createFileRoute } from "@tanstack/react-router";
import { Mailbox, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/mailbox")({
  component: () => (
    <ProtectedRoute><Mailbox /></ProtectedRoute>
  ),
});
