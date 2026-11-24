import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { AffiliateSignup, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/affiliates")({
  component: () => (
    <Suspense fallback={<PageLoader />}><AffiliateSignup /></Suspense>
  ),
});
