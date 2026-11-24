import { createFileRoute } from "@tanstack/react-router";
import { BrokersOnlyGate } from "@/components/BrokersOnlyGate";
import { MyAds, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/my-ads/")({
  component: () => (
    <ProtectedRoute><BrokersOnlyGate to="/campaigns"><MyAds /></BrokersOnlyGate></ProtectedRoute>
  ),
});
