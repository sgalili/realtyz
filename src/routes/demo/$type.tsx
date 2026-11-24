import { createFileRoute } from "@tanstack/react-router";
import { DemoEntry } from "@/app/AppRoutes";

export const Route = createFileRoute("/demo/$type")({
  component: () => <DemoEntry />,
});
