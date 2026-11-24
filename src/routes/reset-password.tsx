import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "@/app/AppRoutes";

export const Route = createFileRoute("/reset-password")({
  component: () => <ResetPassword />,
});
