import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { FaqPage, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/faq")({
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><FaqPage /></Suspense></PublicProfileShell>
  ),
});
