import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { DeveloperDashboard, PageLoader, ProjectsRoute, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/developer-dashboard")({
  component: () => (
    <ProjectsRoute><ProtectedRoute><Suspense fallback={<PageLoader />}><DeveloperDashboard /></Suspense></ProtectedRoute></ProjectsRoute>
  ),
});
