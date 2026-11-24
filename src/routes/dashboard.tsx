import { createFileRoute } from "@tanstack/react-router";
import { Index, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: 'לוח הבקרה שלי | TORAFF' },
    { name: 'description', content: 'תמונת מצב של הנכסים, הלידים, המטלות והפעילות העסקית שלך ב־TORAFF.' },
    { property: 'og:title', content: 'לוח הבקרה שלי | TORAFF' },
    { property: 'og:description', content: 'תמונת מצב של הנכסים, הלידים, המטלות והפעילות העסקית שלך ב־TORAFF.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><Index /></ProtectedRoute>
  ),
});
