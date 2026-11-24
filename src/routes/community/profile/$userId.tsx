import { createFileRoute } from "@tanstack/react-router";
import { LegacyProfileRedirect } from "@/app/AppRoutes";

export const Route = createFileRoute("/community/profile/$userId")({
  component: () => (
    <LegacyProfileRedirect to="broker" />
  ),
});
