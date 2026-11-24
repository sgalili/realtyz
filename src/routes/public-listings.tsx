import { createFileRoute } from "@tanstack/react-router";
import { RootRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/public-listings")({
  component: () => <RootRoute />,
});
