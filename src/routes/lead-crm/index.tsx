import { createFileRoute } from "@tanstack/react-router";
import { LeadCRM, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/lead-crm/")({
  head: () => ({ meta: [{ title: 'TORAFF | לידים וסיכומי שיחות ריטה' }, { name: 'description', content: 'כרטיסי לידים, סיכומי שיחות ותובנות ריטה במרחב העבודה שלך.' }, { property: 'og:title', content: 'TORAFF | לידים וסיכומי שיחות ריטה' }, { property: 'og:description', content: 'כרטיסי לידים, סיכומי שיחות ותובנות ריטה במרחב העבודה שלך.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>
  ),
});
