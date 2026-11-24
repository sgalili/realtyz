import { createFileRoute } from "@tanstack/react-router";
import { SuperAdmin, SuperAdminRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [
    { title: 'ניהול TORAFF' },
    { name: 'description', content: 'ניהול המערכת, ייבוא מתווכים ויזמים ובקרת פעילות ב־TORAFF.' },
    { property: 'og:title', content: 'ניהול TORAFF' },
    { property: 'og:description', content: 'ניהול המערכת, ייבוא מתווכים ויזמים ובקרת פעילות ב־TORAFF.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => (
    <SuperAdminRoute><SuperAdmin /></SuperAdminRoute>
  ),
});
