import { createFileRoute } from "@tanstack/react-router";
import { LegacyProfileRedirect } from "@/app/AppRoutes";

export const Route = createFileRoute("/community/office/$userId")({
  component: () => (
    <LegacyProfileRedirect to="agency" />
  ),
});
