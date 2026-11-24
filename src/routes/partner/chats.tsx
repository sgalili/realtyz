import { createFileRoute } from "@tanstack/react-router";
import { PartnerChats, PartnerOnlyRoute, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/partner/chats")({
  component: () => (
    <ProtectedRoute><PartnerOnlyRoute><PartnerChats /></PartnerOnlyRoute></ProtectedRoute>
  ),
});
