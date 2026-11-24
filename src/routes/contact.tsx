import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ContactForm, PageLoader } from "@/app/AppRoutes";
import { visitorRouteHead } from '@/lib/platformPresentation';
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { PublicProfileShell } from '@/components/public/PublicProfileShell';

export const Route = createFileRoute("/contact")({
  head: () => visitorRouteHead('/contact'),
  component: ContactPage,
});

function ContactPage() {
  const content = <Suspense fallback={<PageLoader />}><ContactForm /></Suspense>;
  return useBrokersOnly() ? <PublicProfileShell hero>{content}</PublicProfileShell> : content;
}
