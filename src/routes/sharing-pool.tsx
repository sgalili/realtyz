import { createFileRoute } from "@tanstack/react-router";
import { PartnerOnlyRoute, ProtectedRoute, SharingPool } from "@/app/AppRoutes";

export const Route = createFileRoute("/sharing-pool")({
  component: () => (
    <PartnerOnlyRoute><ProtectedRoute><SharingPool /></ProtectedRoute></PartnerOnlyRoute>
  ),
});
