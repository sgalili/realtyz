import { createFileRoute } from "@tanstack/react-router";
import { BusinessPerformance, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/business-performance")({
  component: () => (
    <ProtectedRoute><BusinessPerformance /></ProtectedRoute>
  ),
});
