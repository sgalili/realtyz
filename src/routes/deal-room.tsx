import { createFileRoute } from "@tanstack/react-router";
import { DealsRoute, ProtectedRoute, RoleTransactions } from "@/app/AppRoutes";

export const Route = createFileRoute("/deal-room")({
  head: () => ({ meta: [{ title: 'TORAFF | חדר עסקאות וסיכומי ריטה' }, { name: 'description', content: 'ניהול עסקאות, לידים ותובנות משיחות ריטה במרחב העבודה שלך.' }, { property: 'og:title', content: 'TORAFF | חדר עסקאות וסיכומי ריטה' }, { property: 'og:description', content: 'ניהול עסקאות, לידים ותובנות משיחות ריטה במרחב העבודה שלך.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => (
    <DealsRoute><ProtectedRoute allowGuestDemo><RoleTransactions /></ProtectedRoute></DealsRoute>
  ),
});
