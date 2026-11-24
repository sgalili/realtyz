import { createFileRoute } from "@tanstack/react-router";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { Suspense } from "react";
import { CommissionMechanism, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/commission-mechanism")({
  component: () => (
    <PublicProfileShell hero><Suspense fallback={<PageLoader />}><CommissionMechanism /></Suspense></PublicProfileShell>
  ),
});
