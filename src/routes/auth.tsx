import { createFileRoute } from "@tanstack/react-router";
import { AuthRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/auth")({
  component: () => <AuthRoute />,
});
