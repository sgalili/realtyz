import { createFileRoute } from "@tanstack/react-router";
import { CampaignCenter, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/campaigns")({
  component: () => (
    <ProtectedRoute allowGuestDemo><CampaignCenter /></ProtectedRoute>
  ),
});
