import { createFileRoute } from "@tanstack/react-router";
import { PartnerNetwork, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/referral")({
  component: () => (
    <ProtectedRoute><PartnerNetwork /></ProtectedRoute>
  ),
});
