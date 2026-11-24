import { createFileRoute } from "@tanstack/react-router";
import { CampaignCenter, PartnerOnlyRoute, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/posts")({
  component: () => (
    <ProtectedRoute><PartnerOnlyRoute><CampaignCenter /></PartnerOnlyRoute></ProtectedRoute>
  ),
});
