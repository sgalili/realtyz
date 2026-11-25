import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { DigitalSignatures, PageLoader, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/signatures")({
  head: () => ({ meta: [{ title: 'TORAFF | חתימות דיגיטליות' }, { name: 'description', content: 'הכנת הסכמים, שליחה לחתימה ואישור מסמכים ב־TORAFF.' }, { property: 'og:title', content: 'TORAFF | חתימות דיגיטליות' }, { property: 'og:description', content: 'הכנת הסכמים, שליחה לחתימה ואישור מסמכים ב־TORAFF.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><DigitalSignatures /></Suspense></ProtectedRoute>
  ),
});
