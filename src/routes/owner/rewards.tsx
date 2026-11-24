import { createFileRoute } from "@tanstack/react-router";
import { OwnerRewards, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/owner/rewards")({
  component: () => (
    <ProtectedRoute><OwnerRewards /></ProtectedRoute>
  ),
});
