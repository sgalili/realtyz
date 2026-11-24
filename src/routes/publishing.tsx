import { createFileRoute } from "@tanstack/react-router";
import { BrokersOnlyGate } from "@/components/BrokersOnlyGate";
import { ProtectedRoute, PublishingHub } from "@/app/AppRoutes";

export const Route = createFileRoute("/publishing")({
  component: () => (
    <ProtectedRoute><BrokersOnlyGate to="/campaigns"><PublishingHub /></BrokersOnlyGate></ProtectedRoute>
  ),
});
