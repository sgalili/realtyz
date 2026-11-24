import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ContactForm, PageLoader } from "@/app/AppRoutes";

export const Route = createFileRoute("/contact")({
  component: () => (
    <Suspense fallback={<PageLoader />}><ContactForm /></Suspense>
  ),
});
